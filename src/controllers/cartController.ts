import { Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { SessionRequest } from "../middlewares/sessionMiddleware";
import { emitCartUpdate } from "../realtime/socket";

async function loadCart(tableSessionId: string) {
  const items = await prisma.sessionCartItem.findMany({
    where: { tableSessionId },
    include: { menuItem: true },
    orderBy: { createdAt: "asc" },
  });

  const total = items.reduce((sum, i) => sum + Number(i.menuItem.price) * i.quantity, 0);

  return { items, total };
}

/**
 * Customer Endpoint: Fetch the shared, not-yet-submitted selection for this
 * table session — every device joined to the session sees the same cart.
 */
export const getCart = catchAsync(async (req: SessionRequest, res: Response): Promise<void> => {
  const tableSessionId = req.tableSession.id;
  const cart = await loadCart(tableSessionId);

  res.status(200).json({ success: true, ...cart });
});

/**
 * Customer Endpoint: Adjust one item's quantity in the shared cart (+1 / -1,
 * or 0 to leave it alone) and/or set its special-instructions note, then
 * push the resulting cart to every device joined to this table session.
 */
export const updateCartItem = catchAsync(async (req: SessionRequest, res: Response): Promise<void> => {
  const tableSessionId = req.tableSession.id;
  const restaurantId = req.tableSession.table.restaurantId;
  const { menuItemId, delta, notes } = req.body;

  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    include: { category: true },
  });

  if (!menuItem) {
    throw new AppError("Menu item not found", 404);
  }

  if (menuItem.category.restaurantId !== restaurantId) {
    throw new AppError("This item isn't on this restaurant's menu", 403);
  }

  if (delta > 0 && !menuItem.isAvailable) {
    throw new AppError("This item is currently unavailable", 422);
  }

  const existing = await prisma.sessionCartItem.findUnique({
    where: { tableSessionId_menuItemId: { tableSessionId, menuItemId } },
  });

  if (!existing && delta <= 0) {
    // Nothing to remove and nothing to attach a note to.
    throw new AppError("This item isn't in your cart", 404);
  }

  const nextQuantity = (existing?.quantity ?? 0) + delta;
  const noteData = notes !== undefined ? { notes } : {};

  if (nextQuantity <= 0) {
    if (existing) {
      await prisma.sessionCartItem.delete({ where: { id: existing.id } });
    }
  } else if (existing) {
    await prisma.sessionCartItem.update({
      where: { id: existing.id },
      data: { quantity: nextQuantity, ...noteData },
    });
  } else {
    await prisma.sessionCartItem.create({
      data: { tableSessionId, menuItemId, quantity: nextQuantity, ...noteData },
    });
  }

  const cart = await loadCart(tableSessionId);
  emitCartUpdate(tableSessionId, cart);

  res.status(200).json({ success: true, ...cart });
});
