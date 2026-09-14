import { Response } from "express";
import prisma from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { AuthenticatedRequest } from "../middlewares/authMiddleware";
import { generateSignedQrCode, generateQrCodeDataUrl, generateQrCodeBuffer } from "../utils/qrHelper";
import { TableStatus } from "@prisma/client";

/**
 * Admin Endpoint: Create a new Restaurant Table & generate signed QR Code link + printable image
 */
export const createTable = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { tableNumber } = req.body;
  const rawRestaurantId = req.user?.restaurantId || req.body.restaurantId;
  const restaurantId = rawRestaurantId ? String(rawRestaurantId) : null;
  console.log("restaurantId", restaurantId)

  if (!restaurantId) {
    throw new AppError("restaurantId is required to create a table", 400);
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
  });

  if (!restaurant) {
    throw new AppError(`Restaurant with ID '${restaurantId}' does not exist. Please re-authenticate to obtain a valid session.`, 404);
  }

  const existingTable = await prisma.table.findFirst({
    where: {
      restaurantId,
      tableNumber: String(tableNumber),
    },
  });

  if (existingTable) {
    throw new AppError(`Table number ${tableNumber} already exists for this restaurant`, 409);
  }

  // 1. Generate signed QR code string
  const qrTableCode = generateSignedQrCode(restaurantId, String(tableNumber));

  // 2. Target Web App URL scanned by customer's phone
  const clientAppUrl = process.env.CLIENT_APP_URL || "http://localhost:5173";
  const qrScanUrl = `${clientAppUrl}/menu?code=${qrTableCode}`;

  // 3. Generate Base64 QR Image for printing table stickers
  const qrImageDataUrl = await generateQrCodeDataUrl(qrScanUrl);

  const table = await prisma.table.create({
    data: {
      tableNumber: String(tableNumber),
      qrTableCode,
      status: TableStatus.FREE,
      restaurantId,
    },
  });

  res.status(201).json({
    success: true,
    message: "Table created and QR code generated successfully",
    table,
    qrScanUrl,
    qrImageDataUrl,
    qrDownloadUrl: `/api/admin/tables/${table.id}/qr/download`,
  });
});

/**
 * Staff/Admin Endpoint: List all tables for restaurant with active session details & QR codes
 */
export const getTables = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rawRestaurantId = req.user?.restaurantId || req.query.restaurantId;
  const restaurantId = rawRestaurantId ? String(rawRestaurantId) : undefined;

  if (!restaurantId) {
    throw new AppError("restaurantId is required", 400);
  }

  const tables = await prisma.table.findMany({
    where: { restaurantId },
    include: {
      sessions: {
        where: { status: "ACTIVE" },
        take: 1,
        include: {
          orders: {
            where: {
              status: { notIn: ["CANCELLED", "BILLED"] },
            },
            select: {
              id: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
          },
        },
      },
    },
    orderBy: { tableNumber: "asc" },
  });

  const clientAppUrl = process.env.CLIENT_APP_URL || "http://localhost:5173";

  const enrichedTables = tables.map((t) => ({
    id: t.id,
    tableNumber: t.tableNumber,
    qrTableCode: t.qrTableCode,
    status: t.status,
    qrScanUrl: `${clientAppUrl}/menu?code=${t.qrTableCode}`,
    activeSession: t.sessions[0] || null,
  }));

  res.status(200).json({
    success: true,
    count: enrichedTables.length,
    tables: enrichedTables,
  });
});

/**
 * Staff/Admin Endpoint: Get single table details by ID
 */
export const getTableById = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tableId = req.params.id as string;

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: {
      sessions: {
        where: { status: "ACTIVE" },
        take: 1,
        include: {
          orders: {
            include: {
              items: {
                include: { menuItem: true },
              },
            },
          },
          bills: true,
        },
      },
    },
  });

  if (!table) {
    throw new AppError("Table not found", 404);
  }

  const clientAppUrl = process.env.CLIENT_APP_URL || "http://localhost:5173";
  const qrScanUrl = `${clientAppUrl}/menu?code=${table.qrTableCode}`;

  res.status(200).json({
    success: true,
    table: {
      ...table,
      qrScanUrl,
      qrDownloadUrl: `/api/admin/tables/${table.id}/qr/download`,
    },
  });
});

/**
 * Admin Endpoint: Update table number or status
 */
export const updateTable = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tableId = req.params.id as string;
  const { tableNumber, status } = req.body;

  const table = await prisma.table.findUnique({
    where: { id: tableId },
  });

  if (!table) {
    throw new AppError("Table not found", 404);
  }

  let qrTableCode = table.qrTableCode;
  if (tableNumber && tableNumber !== table.tableNumber) {
    qrTableCode = generateSignedQrCode(table.restaurantId, String(tableNumber));
  }

  const updatedTable = await prisma.table.update({
    where: { id: tableId },
    data: {
      ...(tableNumber && { tableNumber: String(tableNumber) }),
      ...(status && { status }),
      qrTableCode,
    },
  });

  res.status(200).json({
    success: true,
    message: "Table updated successfully",
    table: updatedTable,
  });
});

/**
 * Admin Endpoint: Delete table
 */
export const deleteTable = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tableId = req.params.id as string;

  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: {
      sessions: {
        where: { status: "ACTIVE" },
      },
    },
  });

  if (!table) {
    throw new AppError("Table not found", 404);
  }

  if (table.sessions.length > 0) {
    throw new AppError("Cannot delete table with an active dining session", 400);
  }

  await prisma.table.delete({
    where: { id: tableId },
  });

  res.status(200).json({
    success: true,
    message: "Table deleted successfully",
  });
});

/**
 * Staff/Admin Endpoint: Fetch printable QR code image for a specific table
 */
export const getTableQr = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tableId = req.params.id as string;

  const table = await prisma.table.findUnique({
    where: { id: tableId },
  });

  if (!table) {
    throw new AppError("Table not found", 404);
  }

  const clientAppUrl = process.env.CLIENT_APP_URL || "http://localhost:5173";
  const qrScanUrl = `${clientAppUrl}/menu?code=${table.qrTableCode}`;
  const qrImageDataUrl = await generateQrCodeDataUrl(qrScanUrl);

  res.status(200).json({
    success: true,
    tableId: table.id,
    tableNumber: table.tableNumber,
    qrTableCode: table.qrTableCode,
    qrScanUrl,
    qrImageDataUrl,
    qrDownloadUrl: `/api/admin/tables/${table.id}/qr/download`,
  });
});

/**
 * Staff/Admin Endpoint: Download PNG QR image file
 */
export const downloadTableQr = catchAsync(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tableId = req.params.id as string;

  const table = await prisma.table.findUnique({
    where: { id: tableId },
  });

  if (!table) {
    throw new AppError("Table not found", 404);
  }

  const clientAppUrl = process.env.CLIENT_APP_URL || "http://localhost:5173";
  const qrScanUrl = `${clientAppUrl}/menu?code=${table.qrTableCode}`;
  const qrBuffer = await generateQrCodeBuffer(qrScanUrl);

  const filename = `table-${table.tableNumber}-qr.png`;
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(qrBuffer);
});
