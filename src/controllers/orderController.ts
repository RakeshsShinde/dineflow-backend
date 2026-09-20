import { Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { SessionRequest } from "../middlewares/sessionMiddleware";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { emitCartUpdate, emitOrderUpdate, emitSessionClosed } from "../realtime/socket";
import { OrderStatus, OrderItemStatus, TableStatus, SessionStatus } from "@prisma/client";

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

const STATUS_LADDER: OrderStatus[] = [
  OrderStatus.PLACED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SERVED,
];

const ITEM_STATUS_LADDER: OrderItemStatus[] = [
  OrderItemStatus.PENDING,
  OrderItemStatus.PREPARING,
  OrderItemStatus.READY,
  OrderItemStatus.SERVED,
];

/**
 * Order.status is never written directly by a mutation — it's always
 * recomputed as the least-progressed item's status. This is what lets a
 * mid-order addition (a new PENDING item) coexist with items that already
 * finished cooking, instead of the whole order being force-reset and then
 * bulk-overwriting everything back down on the next advance.
 */
function aggregateOrderStatus(items: { itemStatus: OrderItemStatus }[]): OrderStatus {
  const relevant = items.filter((i) => i.itemStatus !== OrderItemStatus.CANCELLED);
  const source = relevant.length > 0 ? relevant : items;
  const minIndex = Math.min(...source.map((i) => ITEM_STATUS_LADDER.indexOf(i.itemStatus)));
  return STATUS_LADDER[minIndex] ?? OrderStatus.PLACED;
}

const orderInclude = {
  items: {
    include: { menuItem: true, addedByStaff: { select: { name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

async function findActiveOrder(tableSessionId: string) {
  return prisma.order.findFirst({
    where: { tableSessionId, status: { in: ACTIVE_ORDER_STATUSES } },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Customer Endpoint: Place an order from everything currently in the shared
 * cart. Blocked while this table session already has an active (unpaid)
 * order — the DB-level partial unique index `one_active_order_per_session`
 * is the real guard against two devices placing at the same instant; this
 * check is just the fast path that produces a friendly message.
 */
export const placeOrder = catchAsync(async (req: SessionRequest, res: Response): Promise<void> => {
  const tableSessionId = req.tableSession.id;

  const existingActive = await findActiveOrder(tableSessionId);
  if (existingActive) {
    throw new AppError(
      "This table already has an order being prepared. New orders can't be placed until that order's bill is paid.",
      409,
      "TABLE_OCCUPIED"
    );
  }

  const cartItems = await prisma.sessionCartItem.findMany({
    where: { tableSessionId },
    include: { menuItem: true },
  });

  if (cartItems.length === 0) {
    throw new AppError("Your cart is empty. Add items before placing an order.", 400);
  }

  const unavailable = cartItems.find((c) => !c.menuItem.isAvailable);
  if (unavailable) {
    throw new AppError(
      `"${unavailable.menuItem.name}" is no longer available — please remove it from your selection.`,
      422
    );
  }

  const totalAmount = cartItems.reduce((sum, c) => sum + Number(c.menuItem.price) * c.quantity, 0);

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          tableSessionId,
          status: OrderStatus.PLACED,
          source: "CUSTOMER_APP",
          totalAmount,
          items: {
            create: cartItems.map((c) => ({
              menuItemId: c.menuItemId,
              quantity: c.quantity,
              notes: c.notes,
              source: "CUSTOMER_APP",
              itemStatus: OrderItemStatus.PENDING,
            })),
          },
        },
        include: orderInclude,
      });

      await tx.sessionCartItem.deleteMany({ where: { tableSessionId } });
      await tx.tableSession.update({
        where: { id: tableSessionId },
        data: { lastActivityAt: new Date() },
      });
      await tx.table.update({
        where: { id: req.tableSession.tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      return created;
    });
  } catch (error: any) {
    const isUniqueViolation =
      error?.code === "P2002" || error?.code === "23505" || error?.cause?.code === "23505";
    if (isUniqueViolation) {
      throw new AppError(
        "This table already has an order being prepared. New orders can't be placed until that order's bill is paid.",
        409,
        "TABLE_OCCUPIED"
      );
    }
    throw error;
  }

  emitOrderUpdate(tableSessionId, order);
  emitCartUpdate(tableSessionId, { success: true, items: [], total: 0 });

  res.status(201).json({ success: true, message: "Order placed successfully", order });
});

/**
 * Customer Endpoint: The current active order for this table session (if
 * any), so every device can tell whether to show the menu/cart or the order
 * status tracker.
 */
export const getCurrentOrder = catchAsync(async (req: SessionRequest, res: Response): Promise<void> => {
  const order = await findActiveOrder(req.tableSession.id);
  res.status(200).json({ success: true, order: order ?? null });
});

/**
 * Staff Endpoint: Active (in-progress, unpaid) orders across the staff
 * member's restaurant — the working queue for the floor/kitchen.
 */
export const listActiveOrders = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const restaurantId = req.user!.restaurantId;
  if (!restaurantId) throw new AppError("Your account isn't linked to a restaurant", 403);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_ORDER_STATUSES },
      tableSession: { table: { restaurantId } },
    },
    include: {
      ...orderInclude,
      tableSession: { include: { table: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  res.status(200).json({ success: true, count: orders.length, orders });
});

/**
 * Staff Endpoint: Advance an order forward along PLACED -> PREPARING -> READY
 * -> SERVED (kitchen/waiter marking progress). Only advances the items that
 * are actually behind the target status — an item that's already further
 * along (e.g. one that was Ready before a new item got added mid-order) is
 * left exactly as it is, instead of being bulk-overwritten back down.
 */
export const advanceOrderStatus = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status } = req.body as { status: OrderStatus };
  const restaurantId = req.user!.restaurantId;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { tableSession: { include: { table: true } }, items: true },
  });

  if (!order || order.tableSession.table.restaurantId !== restaurantId) {
    throw new AppError("Order not found", 404);
  }

  const currentAggregate = aggregateOrderStatus(order.items);
  const currentIndex = STATUS_LADDER.indexOf(currentAggregate);
  const targetIndex = STATUS_LADDER.indexOf(status);

  if (currentIndex === -1 || targetIndex === -1 || targetIndex <= currentIndex) {
    throw new AppError(
      `Can't move an order from ${currentAggregate} to ${status}. Status only moves forward.`,
      400
    );
  }

  const targetItemStatus = ITEM_STATUS_LADDER[targetIndex]!;
  const laggingItemStatuses = ITEM_STATUS_LADDER.slice(0, targetIndex);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: { orderId: id, itemStatus: { in: laggingItemStatuses } },
      data: { itemStatus: targetItemStatus },
    });
    const freshItems = await tx.orderItem.findMany({ where: { orderId: id } });
    return tx.order.update({
      where: { id },
      data: { status: aggregateOrderStatus(freshItems) },
      include: orderInclude,
    });
  });

  emitOrderUpdate(order.tableSessionId, updated);

  res.status(200).json({ success: true, message: `Order marked ${status}`, order: updated });
});

/**
 * Staff Endpoint (waiter/admin only): Add an extra item to an order that's
 * already in progress — the "customer asked for one more thing" case, after
 * talking it over at the table. The new item starts PENDING like any other,
 * and the order's status is recomputed from every item (see
 * aggregateOrderStatus) rather than forced — since a fresh PENDING item is
 * always the least-progressed, the order still shows back in "Placed" so
 * the kitchen notices, but nothing already cooking or served gets touched.
 */
export const addOrderItem = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const restaurantId = req.user!.restaurantId;
  const { menuItemId, quantity, notes } = req.body as {
    menuItemId: string;
    quantity: number;
    notes?: string;
  };

  const order = await prisma.order.findUnique({
    where: { id },
    include: { tableSession: { include: { table: true } } },
  });

  if (!order || order.tableSession.table.restaurantId !== restaurantId) {
    throw new AppError("Order not found", 404);
  }

  if (order.status === OrderStatus.BILLED || order.status === OrderStatus.CANCELLED) {
    throw new AppError("This order has already been settled — start a new order for anything else.", 409);
  }

  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    include: { category: true },
  });

  if (!menuItem || menuItem.category.restaurantId !== restaurantId) {
    throw new AppError("Menu item not found", 404);
  }

  if (!menuItem.isAvailable) {
    throw new AppError(`"${menuItem.name}" is currently unavailable`, 422);
  }

  const addedAmount = Number(menuItem.price) * quantity;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderItem.create({
      data: {
        orderId: id,
        menuItemId,
        quantity,
        notes,
        source: "STAFF_MANUAL",
        itemStatus: OrderItemStatus.PENDING,
        addedByStaffId: req.user!.userId,
      },
    });

    const freshItems = await tx.orderItem.findMany({ where: { orderId: id } });
    return tx.order.update({
      where: { id },
      data: {
        status: aggregateOrderStatus(freshItems),
        totalAmount: { increment: addedAmount },
      },
      include: orderInclude,
    });
  });

  emitOrderUpdate(order.tableSessionId, updated);

  res
    .status(201)
    .json({ success: true, message: `"${menuItem.name}" added to the order`, order: updated });
});

/**
 * Staff Endpoint (waiter/admin only): Update an existing order line's
 * quantity and/or note. Only allowed while that specific item is still
 * PENDING — the kitchen hasn't started on it yet — regardless of what
 * state the rest of the order is in. A freshly-added item on an otherwise
 * Ready order can still be fixed; an item the kitchen has already begun
 * cooking cannot.
 */
export const updateOrderItem = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const itemId = req.params.itemId as string;
  const restaurantId = req.user!.restaurantId;
  const { quantity, notes } = req.body as { quantity?: number; notes?: string };

  const order = await prisma.order.findUnique({
    where: { id },
    include: { tableSession: { include: { table: true } }, items: true },
  });

  if (!order || order.tableSession.table.restaurantId !== restaurantId) {
    throw new AppError("Order not found", 404);
  }

  const item = order.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError("Order item not found", 404);
  }

  if (item.itemStatus !== OrderItemStatus.PENDING) {
    throw new AppError("This item has already started cooking — it can no longer be changed.", 409);
  }

  let delta = 0;
  if (quantity !== undefined && quantity !== item.quantity) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    delta = (quantity - item.quantity) * Number(menuItem!.price);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(notes !== undefined && { notes }),
      },
    });

    return tx.order.update({
      where: { id },
      data: delta !== 0 ? { totalAmount: { increment: delta } } : {},
      include: orderInclude,
    });
  });

  emitOrderUpdate(order.tableSessionId, updated);

  res.status(200).json({ success: true, message: "Order item updated", order: updated });
});

/**
 * Staff Endpoint (waiter/admin only): Remove an order line entirely. Same
 * per-item PENDING-only rule as updateOrderItem, plus an order can never be
 * emptied out to zero items this way. Recomputes Order.status afterward —
 * removing the one lagging item can pull the whole order's aggregate
 * forward (e.g. Placed -> Ready) if everything else was already done.
 */
export const deleteOrderItem = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const itemId = req.params.itemId as string;
  const restaurantId = req.user!.restaurantId;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { tableSession: { include: { table: true } }, items: true },
  });

  if (!order || order.tableSession.table.restaurantId !== restaurantId) {
    throw new AppError("Order not found", 404);
  }

  const item = order.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError("Order item not found", 404);
  }

  if (item.itemStatus !== OrderItemStatus.PENDING) {
    throw new AppError("This item has already started cooking — it can no longer be changed.", 409);
  }

  if (order.items.length <= 1) {
    throw new AppError("An order needs at least one item.", 409);
  }

  const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
  const removedAmount = item.quantity * Number(menuItem!.price);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderItem.delete({ where: { id: itemId } });

    const freshItems = await tx.orderItem.findMany({ where: { orderId: id } });
    return tx.order.update({
      where: { id },
      data: { status: aggregateOrderStatus(freshItems), totalAmount: { decrement: removedAmount } },
      include: orderInclude,
    });
  });

  emitOrderUpdate(order.tableSessionId, updated);

  res.status(200).json({ success: true, message: "Item removed from the order", order: updated });
});

/**
 * Staff Endpoint: Settle the bill for an order — creates the Bill + a
 * successful Payment and marks the order BILLED. This is what unlocks the
 * table for a new order.
 */
export const payOrder = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const restaurantId = req.user!.restaurantId;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { tableSession: { include: { table: true } } },
  });

  if (!order || order.tableSession.table.restaurantId !== restaurantId) {
    throw new AppError("Order not found", 404);
  }

  if (order.status === OrderStatus.BILLED || order.status === OrderStatus.CANCELLED) {
    throw new AppError("This order has already been settled.", 409);
  }

  const subtotal = Number(order.totalAmount);
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const grandTotal = subtotal + tax;

  const { updatedOrder, bill } = await prisma.$transaction(async (tx) => {
    const createdBill = await tx.bill.create({
      data: {
        tableSessionId: order.tableSessionId,
        subtotal,
        tax,
        discount: 0,
        grandTotal,
        payments: {
          create: { method: "COUNTER", status: "SUCCESS", paidAt: new Date() },
        },
      },
      include: { payments: true },
    });

    const updated = await tx.order.update({
      where: { id },
      data: { status: OrderStatus.BILLED },
      include: orderInclude,
    });

    // Settling the bill ends this diner's visit: close out the session and
    // free the table so the next customer who scans the QR code gets a
    // brand-new session instead of silently reattaching to this one.
    await tx.tableSession.update({
      where: { id: order.tableSessionId },
      data: { status: SessionStatus.CLOSED, endedAt: new Date() },
    });
    await tx.table.update({
      where: { id: order.tableSession.tableId },
      data: { status: TableStatus.FREE },
    });

    return { updatedOrder: updated, bill: createdBill };
  });

  emitOrderUpdate(order.tableSessionId, updatedOrder);
  emitSessionClosed(order.tableSessionId);

  res.status(200).json({ success: true, message: "Bill settled — the table is now free", order: updatedOrder, bill });
});
