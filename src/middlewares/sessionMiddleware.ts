import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { SessionStatus } from "@prisma/client";

export interface SessionRequest extends Request {
  tableSession?: any;
}

export const validateTableSession = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Read sessionToken from cookie or Header 'x-session-token'
  const sessionToken =
    req.headers["x-session-token"] as string ||
    req.cookies?.session ||
    (req.headers.authorization?.startsWith("Session ")
      ? req.headers.authorization.split(" ")[1]
      : undefined);

  if (!sessionToken) {
    res.status(401).json({
      success: false,
      message: "Session token missing. Please scan table QR code to join table session.",
    });
    return;
  }

  try {
    const session = await prisma.tableSession.findUnique({
      where: { sessionToken },
      include: { table: true },
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: "Invalid table session token",
      });
      return;
    }

    if (session.status !== SessionStatus.ACTIVE) {
      const isClosed = session.status === SessionStatus.CLOSED;
      res.status(409).json({
        error: isClosed ? "SESSION_CLOSED" : "SESSION_BILLING",
        message: isClosed
          ? "This table session has ended. Scan the table's QR code again to start a new order."
          : `Table session is currently ${session.status.toLowerCase()}. Further ordering is locked.`,
      });
      return;
    }

    // Update lastActivityAt asynchronously
    prisma.tableSession
      .update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      })
      .catch(() => {});

    req.tableSession = session;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to validate table session",
    });
    return;
  }
};
