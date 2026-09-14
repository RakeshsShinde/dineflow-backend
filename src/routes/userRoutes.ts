import { Router } from "express";
import { getStaffUsers, getMe, updateUser, deleteUser, addStaff } from "../controllers/userController";
import { authenticateStaff, authorizeRoles } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validateMiddleware";
import { updateUserSchema, userIdParamSchema, addStaffSchema } from "../schemas/auth.schema";
import { UserRole } from "@prisma/client";

const router = Router();

router.use(authenticateStaff);

// Profile
router.get("/me", getMe);

// Staff Management by Restaurant Admin
router.get("/staff", authorizeRoles([UserRole.ADMIN]), getStaffUsers);
router.post("/staff", authorizeRoles([UserRole.ADMIN]), validate({ body: addStaffSchema }), addStaff);

// General User Admin management
router.get("/", authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), getStaffUsers);
router.put(
  "/:id",
  authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  updateUser
);
router.delete(
  "/:id",
  authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ params: userIdParamSchema }),
  deleteUser
);

export default router;
