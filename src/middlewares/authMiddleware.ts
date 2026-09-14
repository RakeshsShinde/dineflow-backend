import { Request, Response, NextFunction } from "express";
import { verifyStaffToken, StaffJwtPayload } from "../utils/jwt";
import { UserRole } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user?: StaffJwtPayload;
}

export const authenticateStaff = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authorization token missing ",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyStaffToken(token!);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired staff token",
    });
    return;
  }
};

export const authorizeRoles = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Access forbidden: insufficient role permissions",
      });
      return;
    }
    next();
  };
};
