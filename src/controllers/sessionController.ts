import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { verifySignedQrCode } from "../utils/qrHelper";
import { generateSessionToken } from "../utils/jwt";
import { TableStatus, SessionStatus } from "@prisma/client";

/**
 * Public Customer Endpoint: Verify Scanned QR Code & preview table/restaurant info
 */
export const verifyQrCode = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const qrTableCode = (req.query.code || req.query.qrTableCode) as string;

  if (!qrTableCode) {
    throw new AppError("QR table code is required", 400);
  }

  // 1. Validate signature HMAC
  const parsed = verifySignedQrCode(qrTableCode);
  if (!parsed) {
    throw new AppError("Invalid QR code signature", 400);
  }

  console.log("parsed ", { parsed, qrTableCode })
  // 2. Fetch table & restaurant details
  const table = await prisma.table.findFirst({
    where: {
      restaurantId: parsed.restaurantId,
      tableNumber: parsed.tableNumber,
    },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
      sessions: {
        where: { status: SessionStatus.ACTIVE },
        take: 1,
      },
    },
  });

  if (!table) {
    throw new AppError("Table not found for this QR code", 404);
  }

  res.status(200).json({
    success: true,
    isValid: true,
    table: {
      id: table.id,
      tableNumber: table.tableNumber,
      status: table.status,
      restaurant: table.restaurant,
      hasActiveSession: table.sessions.length > 0,
    },
  });
});

/**
 * Public Customer Endpoint: Join or Start Table Session
 */
export const joinSession = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { qrTableCode } = req.body;

  if (!qrTableCode) {
    throw new AppError("qrTableCode is required to join session", 400);
  }

  // 1. Verify QR code signature
  const parsed = verifySignedQrCode(qrTableCode);
  if (!parsed) {
    throw new AppError("Invalid or tampered QR code signature", 400);
  }

  // 2. Find Table in DB
  const table = await prisma.table.findFirst({
    where: {
      restaurantId: parsed.restaurantId,
      tableNumber: parsed.tableNumber,
    },
    include: {
      restaurant: {
        select: { id: true, name: true },
      },
    },
  });

  if (!table) {
    throw new AppError("Table does not exist", 404);
  }

  // 3. Check for an existing ACTIVE session for this table
  let activeSession = await prisma.tableSession.findFirst({
    where: {
      tableId: table.id,
      status: SessionStatus.ACTIVE,
    },
  });

  console.log("active session", activeSession)

  // 4. If no active session exists, create a new session & set table status to OCCUPIED
  if (!activeSession) {
    const sessionTokenString = generateSessionToken(table.id);

    activeSession = await prisma.$transaction(async (tx) => {
      // Create session
      const newSession = await tx.tableSession.create({
        data: {
          tableId: table.id,
          sessionToken: sessionTokenString,
          status: SessionStatus.ACTIVE,
        },
      });

      // Update table status to OCCUPIED
      await tx.table.update({
        where: { id: table.id },
        data: { status: TableStatus.OCCUPIED },
      });

      return newSession;
    });
  }

  res.status(200).json({
    success: true,
    message: "Joined table session successfully",
    sessionToken: activeSession.sessionToken,
    tableSessionId: activeSession.id,
    table: {
      id: table.id,
      tableNumber: table.tableNumber,
      restaurant: table.restaurant,
    },
  });
});
