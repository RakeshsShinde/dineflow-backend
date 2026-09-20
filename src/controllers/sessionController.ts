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

  // 4. If no active session exists, create a new session & set table status to OCCUPIED.
  // A DB-level partial unique index (one ACTIVE TableSession per tableId) is the real
  // guard here — two concurrent requests can both reach this branch (the findFirst
  // above is a fast path, not a lock), so the loser's INSERT is rejected by Postgres.
  // When that happens, just read back the session the winner created instead of erroring.
  if (!activeSession) {
    const sessionTokenString = generateSessionToken(table.id);

    try {
      activeSession = await prisma.$transaction(async (tx) => {
        const newSession = await tx.tableSession.create({
          data: {
            tableId: table.id,
            sessionToken: sessionTokenString,
            status: SessionStatus.ACTIVE,
          },
        });

        await tx.table.update({
          where: { id: table.id },
          data: { status: TableStatus.OCCUPIED },
        });

        return newSession;
      });
    } catch (error: any) {
      const isUniqueViolation =
        error?.code === "P2002" || error?.code === "23505" || error?.cause?.code === "23505";
      if (!isUniqueViolation) throw error;

      const winner = await prisma.tableSession.findFirst({
        where: { tableId: table.id, status: SessionStatus.ACTIVE },
      });
      if (!winner) throw error;
      activeSession = winner;
    }
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
