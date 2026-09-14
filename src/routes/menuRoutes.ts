import { Router } from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
} from "../controllers/menuController";
import { authenticateStaff, authorizeRoles } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validateMiddleware";
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  toggleMenuItemAvailabilitySchema,
  menuItemIdParamSchema,
} from "../schemas/menu.schema";
import { UserRole } from "@prisma/client";

const router = Router();

router.get("/categories", authenticateStaff, getCategories);
router.get("/items", getMenuItems);

router.post(
  "/admin/categories",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN]),
  validate({ body: createCategorySchema }),
  createCategory
);

router.put(
  "/admin/categories/:id",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN]),
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  updateCategory
);

router.delete(
  "/admin/categories/:id",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN]),
  validate({ params: categoryIdParamSchema }),
  deleteCategory
);

// Menu Items Management
router.post(
  "/admin/items",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN]),
  validate({ body: createMenuItemSchema }),
  createMenuItem
);

router.put(
  "/admin/items/:id",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN]),
  validate({ params: menuItemIdParamSchema, body: updateMenuItemSchema }),
  updateMenuItem
);

router.patch(
  "/admin/items/:id/availability",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN, UserRole.WAITER, UserRole.KITCHEN]),
  validate({ params: menuItemIdParamSchema, body: toggleMenuItemAvailabilitySchema }),
  toggleMenuItemAvailability
);

router.delete(
  "/admin/items/:id",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN]),
  validate({ params: menuItemIdParamSchema }),
  deleteMenuItem
);

export default router;
