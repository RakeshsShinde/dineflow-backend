import { Router } from "express";
import {
  getRestaurants,
  updateRestaurantStatus,
} from "../controllers/superAdminController";
import { authenticateStaff, authorizeRoles } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validateMiddleware";
import { restaurantIdParamSchema, updateRestaurantStatusSchema } from "../schemas/superAdmin.schema";
import { UserRole } from "@prisma/client";

const router = Router();

// Guard all Super Admin routes
router.use(authenticateStaff, authorizeRoles([UserRole.SUPER_ADMIN]));

router.get("/restaurants", getRestaurants);
router.patch(
  "/restaurants/:id/status",
  validate({ params: restaurantIdParamSchema, body: updateRestaurantStatusSchema }),
  updateRestaurantStatus
);

export default router;
