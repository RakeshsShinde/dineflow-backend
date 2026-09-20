import { Router } from "express";
import {
  listActiveOrders,
  advanceOrderStatus,
  payOrder,
  addOrderItem,
  updateOrderItem,
  deleteOrderItem,
} from "../controllers/orderController";
import { authenticateStaff, authorizeRoles } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validateMiddleware";
import {
  orderIdParamSchema,
  updateOrderStatusSchema,
  addOrderItemSchema,
  orderItemParamSchema,
  updateOrderItemSchema,
} from "../schemas/order.schema";
import { UserRole } from "@prisma/client";

const router = Router();

router.get(
  "/",
  authenticateStaff,
  authorizeRoles([UserRole.WAITER, UserRole.KITCHEN, UserRole.ADMIN]),
  listActiveOrders
);

// Waiters get read-only access to the board — advancing status and settling
// the bill are a kitchen/admin job (see frontend/src/lib/permissions.ts,
// `orders.update`, for the matching UI-side rule).
router.patch(
  "/:id/status",
  authenticateStaff,
  authorizeRoles([UserRole.KITCHEN, UserRole.ADMIN]),
  validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
  advanceOrderStatus
);

router.post(
  "/:id/pay",
  authenticateStaff,
  authorizeRoles([UserRole.KITCHEN, UserRole.ADMIN]),
  validate({ params: orderIdParamSchema }),
  payOrder
);

// The reverse of the status rule above: adding items mid-meal — after
// talking it over with the table — is a waiter/admin job, not kitchen's.
router.post(
  "/:id/items",
  authenticateStaff,
  authorizeRoles([UserRole.WAITER, UserRole.ADMIN]),
  validate({ params: orderIdParamSchema, body: addOrderItemSchema }),
  addOrderItem
);

// Editing or removing an existing line is only allowed while the order is
// still PLACED (see updateOrderItem/deleteOrderItem for the status check) —
// once the kitchen starts, those lines lock and only new items can be added.
router.patch(
  "/:id/items/:itemId",
  authenticateStaff,
  authorizeRoles([UserRole.WAITER, UserRole.ADMIN]),
  validate({ params: orderItemParamSchema, body: updateOrderItemSchema }),
  updateOrderItem
);

router.delete(
  "/:id/items/:itemId",
  authenticateStaff,
  authorizeRoles([UserRole.WAITER, UserRole.ADMIN]),
  validate({ params: orderItemParamSchema }),
  deleteOrderItem
);

export default router;
