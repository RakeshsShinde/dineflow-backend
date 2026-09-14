import { z } from "zod";
import { UserRole } from "@prisma/client";

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerRestaurantSchema = z.object({
  name: z.string().min(2, "Restaurant name must be at least 2 characters"),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  adminName: z.string().min(2, "Admin name must be at least 2 characters"),
  adminEmail: z.string().min(1, "Admin email is required").email("Invalid admin email address"),
  adminPassword: z.string().min(6, "Admin password must be at least 6 characters"),
});

export const registerStaffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum([UserRole.ADMIN, UserRole.WAITER, UserRole.KITCHEN]).optional().default(UserRole.WAITER),
  restaurantId: z.string().uuid("Invalid Restaurant UUID").optional(),
});

export const addStaffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum([UserRole.ADMIN, UserRole.WAITER, UserRole.KITCHEN]),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email address").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  role: z.enum([UserRole.ADMIN, UserRole.WAITER, UserRole.KITCHEN, UserRole.CUSTOMER, UserRole.SUPER_ADMIN]).optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid("Invalid User UUID"),
});
