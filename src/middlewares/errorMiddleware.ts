import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { CONFIG } from "../config";
import { Prisma } from "@prisma/client";

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  let error = err;

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[])?.join(", ") || "field";
      error = new AppError(`Duplicate value for unique constraint: ${target}`, 409);
    } else if (err.code === "P2025") {
      error = new AppError("Requested record was not found in database", 404);
    } else if (err.code === "P2003") {
      const fieldName = (err.meta?.field_name as string) || "foreign key";
      error = new AppError(`Foreign key constraint failed: ${fieldName} does not exist`, 400);
    } else {
      error = new AppError(`Database operation failed: ${err.message}`, 400);
    }
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    error = new AppError("Invalid token signature", 401);
  } else if (err.name === "TokenExpiredError") {
    error = new AppError("Authorization token has expired", 401);
  }

  // Handle Syntax / Body Parser errors
  if (err instanceof SyntaxError && "body" in err) {
    error = new AppError("Invalid JSON payload in request body", 400);
  }

  // Handle Zod Validation Errors
  if (err.name === "ZodError" || err.issues) {
    const details = err.issues?.map((issue: any) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    error = new AppError(`Validation failed: ${details || err.message}`, 400);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  if (CONFIG.NODE_ENV === "development") {
    console.error("💥 Error Logged:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(CONFIG.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  next(new AppError(`Cannot find route ${req.originalUrl} on this server`, 404));
};
