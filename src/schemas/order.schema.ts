import { z } from "zod";

export const orderIdParamSchema = z.object({
  id: z.string().uuid("Invalid Order UUID"),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PREPARING", "READY", "SERVED"]),
});

export const addOrderItemSchema = z.object({
  menuItemId: z.string().uuid("Choose a menu item"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(20, "Quantity is too high"),
  notes: z.string().trim().max(200, "Note can't be longer than 200 characters").optional(),
});

export const orderItemParamSchema = z.object({
  id: z.string().uuid("Invalid Order UUID"),
  itemId: z.string().uuid("Invalid Order Item UUID"),
});

export const updateOrderItemSchema = z
  .object({
    quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(20, "Quantity is too high").optional(),
    notes: z.string().trim().max(200, "Note can't be longer than 200 characters").optional(),
  })
  .refine((v) => v.quantity !== undefined || v.notes !== undefined, { message: "Nothing to update" });
