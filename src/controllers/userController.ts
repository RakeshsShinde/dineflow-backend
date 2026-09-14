import { Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { hashPassword } from "../utils/password";
import { UserRole } from "@prisma/client";

/**
 * Restaurant Admin: Create a new staff member (ADMIN, WAITER, or KITCHEN) for their restaurant
 */
export const addStaff = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, email, password, role } = req.body;
  const restaurantId = req.user?.restaurantId;

  if (!restaurantId) {
    throw new AppError("Restaurant Admin must be associated with a restaurant to add staff", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("A user with this email already exists", 409);
  }

  const allowedRoles: UserRole[] = [UserRole.ADMIN, UserRole.WAITER, UserRole.KITCHEN];
  if (!allowedRoles.includes(role)) {
    throw new AppError("Role must be ADMIN, WAITER, or KITCHEN", 400);
  }

  const passwordHash = await hashPassword(password);

  const newStaff = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      restaurantId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      restaurantId: true,
      createdAt: true,
    },
  });

  res.status(201).json({
    success: true,
    message: "Staff member created successfully",
    user: newStaff,
  });
});

/**
 * Admin: Get all staff users for restaurant
 */
export const getStaffUsers = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rawRestaurantId = req.user?.restaurantId || req.query.restaurantId;
  const restaurantId = rawRestaurantId ? String(rawRestaurantId) : undefined;

  const whereClause = restaurantId ? { restaurantId } : {};

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      restaurantId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: users.length,
    users,
  });
});

/**
 * Authenticated User: Get current profile details
 */
export const getMe = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    throw new AppError("Not authenticated", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      restaurantId: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          address: true,
          status: true,
        },
      },
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  res.status(200).json({
    success: true,
    user,
  });
});

/**
 * Admin: Update user details / role / password
 */
export const updateUser = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.params.id as string;

  if (!userId) {
    throw new AppError("Invalid user ID", 400);
  }

  const { name, email, password, role } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new AppError("User not found", 404);
  }

  let passwordHash: string | undefined;
  if (password) {
    passwordHash = await hashPassword(password);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(email && { email }),
      ...(role && { role }),
      ...(passwordHash && { passwordHash }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      restaurantId: true,
      updatedAt: true,
    },
  });

  res.status(200).json({
    success: true,
    message: "User updated successfully",
    user: updatedUser,
  });
});

/**
 * Admin: Delete staff user
 */
export const deleteUser = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.params.id as string;

  if (!userId) {
    throw new AppError("Invalid user ID", 400);
  }

  // Prevent self deletion
  if (req.user?.userId === userId) {
    throw new AppError("You cannot delete your own account", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  res.status(200).json({
    success: true,
    message: "Staff member deleted successfully",
  });
});
