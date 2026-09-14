import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { comparePassword, hashPassword } from "../utils/password";
import { signStaffToken } from "../utils/jwt";
import { UserRole, RestaurantStatus } from "@prisma/client";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";

/**
 * Public Endpoint: Self-register a new Restaurant + Restaurant Admin Account
 */
export const registerRestaurant = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { name, address, gstNumber, adminName, adminEmail, adminPassword } = req.body;

  // Check if admin user email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingUser) {
    throw new AppError("An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(adminPassword);

  // Transactionally create Restaurant and Admin User
  const result = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        name,
        address: address || null,
        gstNumber: gstNumber || null,
        status: RestaurantStatus.PENDING,
      },
    });

    const adminUser = await tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        restaurantId: restaurant.id,
      },
    });

    return { restaurant, adminUser };
  });

  res.status(201).json({
    success: true,
    message: "Restaurant registration submitted successfully. Pending approval by Super Admin.",
    restaurant: {
      id: result.restaurant.id,
      name: result.restaurant.name,
      status: result.restaurant.status,
    },
    adminUser: {
      id: result.adminUser.id,
      name: result.adminUser.name,
      email: result.adminUser.email,
      role: result.adminUser.role,
    },
  });
});

/**
 * Public Endpoint: Staff / Admin / Super Admin Login
 */
export const loginStaff = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { restaurant: true },
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isMatch = await comparePassword(password, user.passwordHash);

  if (!isMatch) {
    throw new AppError("Invalid email or password", 401);
  }

  // If user belongs to a restaurant (and is not SUPER_ADMIN), enforce restaurant status check
  if (user.role !== UserRole.SUPER_ADMIN && user.restaurant) {
    if (user.restaurant.status === RestaurantStatus.PENDING) {
      throw new AppError("Your restaurant registration is pending approval by Super Admin", 403);
    }
    if (user.restaurant.status === RestaurantStatus.REJECTED) {
      throw new AppError("Your restaurant registration was rejected by Super Admin. Please contact support.", 403);
    }
  }

  const token = signStaffToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId,
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
      restaurant: user.restaurant ? {
        id: user.restaurant.id,
        name: user.restaurant.name,
        status: user.restaurant.status,
      } : null,
    },
  });
});

/**
 * Admin Endpoint: Register staff member (Waiter / Kitchen)
 */
export const registerStaff = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    throw new AppError("Name, email, and password are required", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("User with this email already exists", 409);
  }

  const targetRestaurantId = req.user?.restaurantId || (req.body.restaurantId ? String(req.body.restaurantId) : null);

  if (targetRestaurantId) {
    const restaurantExists = await prisma.restaurant.findUnique({
      where: { id: targetRestaurantId },
    });

    if (!restaurantExists) {
      throw new AppError(`Restaurant with ID ${targetRestaurantId} does not exist`, 400);
    }
  }

  const validRoles: UserRole[] = [UserRole.ADMIN, UserRole.WAITER, UserRole.KITCHEN];
  const userRole = role && validRoles.includes(role) ? role : UserRole.WAITER;

  const passwordHash = await hashPassword(password);

  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: userRole,
      restaurantId: targetRestaurantId,
    },
  });

  res.status(201).json({
    success: true,
    message: "Staff member created successfully",
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      restaurantId: newUser.restaurantId,
      createdAt: newUser.createdAt,
    },
  });
});
