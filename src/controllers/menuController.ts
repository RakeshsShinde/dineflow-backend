import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";

/**
 * Staff/Customer Endpoint: List menu categories with active items.
 * When called behind authenticateStaff, restaurantId is taken from req.user (own restaurant).
 * Otherwise restaurantId must be passed as a query param (for a future public/customer route).
 */
export const getCategories = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const queryRestaurantId = typeof req.query.restaurantId === "string" ? req.query.restaurantId : undefined;
  const restaurantId = req.user?.restaurantId ?? queryRestaurantId;

  if (!restaurantId) {
    throw new AppError("restaurantId is required", 400);
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    include: {
      items: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  res.status(200).json({
    success: true,
    count: categories.length,
    categories,
  });
});

/**
 * Admin Endpoint: Create menu category
 */
export const createCategory = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, sortOrder } = req.body;
  const restaurantId = req.user?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Your account isn't associated with a restaurant", 403);
  }

  const category = await prisma.menuCategory.create({
    data: {
      name,
      sortOrder: sortOrder || 0,
      restaurantId,
    },
  });

  res.status(201).json({
    success: true,
    message: "Menu category created successfully",
    category,
  });
});

/**
 * Admin Endpoint: Update category
 */
export const updateCategory = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { name, sortOrder } = req.body;

  const existing = await prisma.menuCategory.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Menu category not found", 404);
  }

  if (existing.restaurantId !== req.user?.restaurantId) {
    throw new AppError("You do not have permission to modify this category", 403);
  }

  const updated = await prisma.menuCategory.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  res.status(200).json({
    success: true,
    message: "Menu category updated successfully",
    category: updated,
  });
});

/**
 * Admin Endpoint: Delete category
 */
export const deleteCategory = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;

  const existing = await prisma.menuCategory.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });

  if (!existing) {
    throw new AppError("Menu category not found", 404);
  }

  if (existing.restaurantId !== req.user?.restaurantId) {
    throw new AppError("You do not have permission to delete this category", 403);
  }

  if (existing._count.items > 0) {
    throw new AppError("Cannot delete category containing menu items. Delete or reassign items first.", 400);
  }

  await prisma.menuCategory.delete({ where: { id } });

  res.status(200).json({
    success: true,
    message: "Menu category deleted successfully",
  });
});

/**
 * Public/Staff Endpoint: List all menu items with category info
 */
export const getMenuItems = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const isVeg = req.query.isVeg !== undefined ? req.query.isVeg === "true" : undefined;
  const isAvailable = req.query.isAvailable !== undefined ? req.query.isAvailable === "true" : undefined;

  const items = await prisma.menuItem.findMany({
    where: {
      ...(categoryId && { categoryId }),
      ...(isVeg !== undefined && { isVeg }),
      ...(isAvailable !== undefined && { isAvailable }),
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
    orderBy: { name: "asc" },
  });

  res.status(200).json({
    success: true,
    count: items.length,
    items,
  });
});

/**
 * Admin Endpoint: Create menu item
 */
export const createMenuItem = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, price, isVeg, isAvailable, categoryId } = req.body;

  const category = await prisma.menuCategory.findUnique({
    where: { id: String(categoryId) },
  });

  if (!category) {
    throw new AppError("Menu category does not exist", 404);
  }

  if (category.restaurantId !== req.user?.restaurantId) {
    throw new AppError("You do not have permission to add items to this category", 403);
  }

  const item = await prisma.menuItem.create({
    data: {
      name,
      price,
      isVeg: isVeg ?? true,
      isAvailable: isAvailable ?? true,
      categoryId: String(categoryId),
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
  });

  res.status(201).json({
    success: true,
    message: "Menu item created successfully",
    item,
  });
});

/**
 * Admin Endpoint: Update menu item
 */
export const updateMenuItem = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { name, price, isVeg, isAvailable, categoryId } = req.body;

  const existing = await prisma.menuItem.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!existing) {
    throw new AppError("Menu item not found", 404);
  }

  if (existing.category.restaurantId !== req.user?.restaurantId) {
    throw new AppError("You do not have permission to modify this menu item", 403);
  }

  if (categoryId) {
    const category = await prisma.menuCategory.findUnique({ where: { id: String(categoryId) } });
    if (!category) {
      throw new AppError("Target category does not exist", 404);
    }
    if (category.restaurantId !== req.user?.restaurantId) {
      throw new AppError("Target category belongs to a different restaurant", 403);
    }
  }

  const updated = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(price !== undefined && { price }),
      ...(isVeg !== undefined && { isVeg }),
      ...(isAvailable !== undefined && { isAvailable }),
      ...(categoryId && { categoryId: String(categoryId) }),
    },
    include: {
      category: { select: { id: true, name: true } },
    },
  });

  res.status(200).json({
    success: true,
    message: "Menu item updated successfully",
    item: updated,
  });
});

/**
 * Staff/Admin Endpoint: Quick toggle menu item availability (Out of Stock / Available)
 */
export const toggleMenuItemAvailability = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { isAvailable } = req.body;

  const existing = await prisma.menuItem.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!existing) {
    throw new AppError("Menu item not found", 404);
  }

  if (existing.category.restaurantId !== req.user?.restaurantId) {
    throw new AppError("You do not have permission to modify this menu item", 403);
  }

  const updated = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
  });

  res.status(200).json({
    success: true,
    message: `Menu item availability updated to ${isAvailable ? 'Available' : 'Unavailable'}`,
    item: updated,
  });
});

/**
 * Admin Endpoint: Delete menu item
 */
export const deleteMenuItem = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;

  const existing = await prisma.menuItem.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!existing) {
    throw new AppError("Menu item not found", 404);
  }

  if (existing.category.restaurantId !== req.user?.restaurantId) {
    throw new AppError("You do not have permission to delete this menu item", 403);
  }

  await prisma.menuItem.delete({ where: { id } });

  res.status(200).json({
    success: true,
    message: "Menu item deleted successfully",
  });
});
