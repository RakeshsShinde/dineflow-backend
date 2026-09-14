import { z } from "zod";

export const verifyQrSchema = z.object({
  code: z.string().optional(),
  qrTableCode: z.string().optional(),
}).refine((data) => data.code || data.qrTableCode, {
  message: "Either 'code' or 'qrTableCode' query parameter must be provided",
});

export const joinSessionSchema = z.object({
  qrTableCode: z.string().min(1, "qrTableCode is required"),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid("Invalid Session UUID"),
});
