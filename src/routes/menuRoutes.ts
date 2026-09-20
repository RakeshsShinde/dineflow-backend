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

// Public: customers browse the categorized menu after scanning a table's QR code
// (restaurantId comes from the query string); staff/admin get the same handler to
// see their own restaurant's menu, resolved from the JWT instead.
router.get("/categories", getCategories);
router.get("/items", getMenuItems);

router.post(
  "/admin/categories",
  authenticateStaff,
  authorizeRoles([UserRole.ADMIN, UserRole.WAITER]),
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
  authorizeRoles([UserRole.ADMIN, UserRole.WAITER]),
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
