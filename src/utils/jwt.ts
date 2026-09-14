import jwt from "jsonwebtoken";
import { CONFIG } from "../config";
import { UserRole } from "@prisma/client";

export interface StaffJwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  restaurantId: string | null;
}

export interface SessionTokenPayload {
  tableSessionId: string;
  tableId: string;
  sessionToken: string;
}

export const signStaffToken = (payload: StaffJwtPayload): string => {
  return jwt.sign(payload, CONFIG.JWT_SECRET, {
    expiresIn: CONFIG.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const verifyStaffToken = (token: string): StaffJwtPayload => {
  return jwt.verify(token, CONFIG.JWT_SECRET) as StaffJwtPayload;
};

export const generateSessionToken = (tableId: string): string => {
  return jwt.sign({ tableId, timestamp: Date.now() }, CONFIG.SESSION_SECRET, {
    expiresIn: CONFIG.SESSION_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const verifySessionToken = (token: string): any => {
  return jwt.verify(token, CONFIG.SESSION_SECRET);
};
