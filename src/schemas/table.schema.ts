import { z } from "zod";
import { TableStatus } from "@prisma/client";

export const createTableSchema = z.object({
  tableNumber: z.coerce.string().min(1, "Table number is required"),
  restaurantId: z.string().uuid("Invalid Restaurant UUID").optional(),
});

export const updateTableSchema = z.object({
  tableNumber: z.coerce.string().min(1, "Table number cannot be empty").optional(),
  status: z.enum([TableStatus.FREE, TableStatus.OCCUPIED, TableStatus.BILLING]).optional(),
});

export const tableIdParamSchema = z.object({
  id: z.string().uuid("Invalid Table UUID"),
});
