import { Router } from "express";
import { loginStaff, registerStaff, registerRestaurant } from "../controllers/authController";
import { validate } from "../middlewares/validateMiddleware";
import { loginSchema, registerStaffSchema, registerRestaurantSchema } from "../schemas/auth.schema";
import { authenticateStaff, authorizeRoles } from "../middlewares/authMiddleware";
import { UserRole } from "@prisma/client";

const router = Router();

// Public: Restaurant Self-Registration
router.post("/register-restaurant", validate({ body: registerRestaurantSchema }), registerRestaurant);

// Public: Login (Super Admin, Restaurant Admin, Staff)
router.post("/login", validate({ body: loginSchema }), loginStaff);

// Admin Only: Register new staff user
router.post(
  "/register",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: registerStaffSchema }),
  registerStaff
);

export default router;
