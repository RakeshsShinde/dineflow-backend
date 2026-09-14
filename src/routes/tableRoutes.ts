import { Router } from "express";
import {
  createTable,
  getTables,
  getTableById,
  updateTable,
  deleteTable,
  getTableQr,
  downloadTableQr,
} from "../controllers/tableController";
import { authenticateStaff, authorizeRoles } from "../middlewares/authMiddleware";
import { validate } from "../middlewares/validateMiddleware";
import { createTableSchema, updateTableSchema, tableIdParamSchema } from "../schemas/table.schema";
import { UserRole } from "@prisma/client";

const router = Router();

router.use(authenticateStaff);

router.get("/", authorizeRoles([UserRole.ADMIN, UserRole.WAITER]), getTables);

router.get("/:id", authorizeRoles([UserRole.ADMIN, UserRole.WAITER]), validate({ params: tableIdParamSchema }), getTableById);

router.post("/", authorizeRoles([UserRole.ADMIN]), validate({ body: createTableSchema }), createTable);

router.put(
  "/:id",
  authorizeRoles([UserRole.ADMIN]),
  validate({ params: tableIdParamSchema, body: updateTableSchema }),
  updateTable
);

router.delete("/:id", authorizeRoles([UserRole.ADMIN]), validate({ params: tableIdParamSchema }), deleteTable);

router.get("/:id/qr", authorizeRoles([UserRole.ADMIN, UserRole.WAITER]), validate({ params: tableIdParamSchema }), getTableQr);
router.get(
  "/:id/qr/download",
  authorizeRoles([UserRole.ADMIN, UserRole.WAITER]),
  validate({ params: tableIdParamSchema }),
  downloadTableQr
);

export default router;
