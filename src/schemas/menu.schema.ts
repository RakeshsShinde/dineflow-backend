import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters"),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters").optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid("Invalid Category UUID"),
});

export const createMenuItemSchema = z.object({
  name: z.string().min(2, "Menu item name must be at least 2 characters"),
  price: z.coerce.number().positive("Price must be a positive number"),
  isVeg: z.boolean().optional().default(true),
  isAvailable: z.boolean().optional().default(true),
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
});

export const updateMenuItemSchema = z.object({
  name: z.string().min(2, "Menu item name must be at least 2 characters").optional(),
  price: z.coerce.number().positive("Price must be a positive number").optional(),
  isVeg: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  categoryId: z.string().uuid("Category ID must be a valid UUID").optional(),
});

export const toggleMenuItemAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const menuItemIdParamSchema = z.object({
  id: z.string().uuid("Invalid Menu Item UUID"),
});
