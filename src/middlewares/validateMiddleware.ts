import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

// Convert camelCase field name to Human-Readable Label (e.g. "adminPassword" -> "Admin password")
const formatFieldLabel = (field: string): string => {
  if (!field) return "Field";
  const result = field.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
};

export const validate = (schemas: ValidationSchemas) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        // Express 5 makes `req.query` a getter with no setter, so it can't be
        // reassigned — mutate the object it returns in place instead.
        const parsedQuery = await schemas.query.parseAsync(req.query);
        Object.assign(req.query as Record<string, unknown>, parsedQuery);
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => {
          const field = issue.path.join(".");
          let message = issue.message;

          // Replace generic Zod missing field error with human-friendly message
          if (
            (issue.code === "invalid_type" && (issue as any).received === "undefined") ||
            message.includes("expected string, received undefined")
          ) {
            message = `${formatFieldLabel(field)} is required`;
          }

          return {
            field,
            message,
          };
        });

        res.status(400).json({
          success: false,
          message: "Validation Error",
          errors: issues,
        });
        return;
      }
      next(error);
    }
  };
};
