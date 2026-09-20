import { z } from "zod";

export const updateCartItemSchema = z.object({
  menuItemId: z.string().uuid("Invalid Menu Item UUID"),
  // 0 means "leave the quantity alone" — how a note-only edit adjusts an
  // item already in the cart without also bumping its count.
  delta: z.union([z.literal(1), z.literal(-1), z.literal(0)]).default(0),
  notes: z.string().trim().max(200, "Note can't be longer than 200 characters").optional(),
});
