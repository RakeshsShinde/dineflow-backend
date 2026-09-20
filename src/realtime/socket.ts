import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import prisma from "../lib/prisma";
import { SessionStatus } from "@prisma/client";

let io: Server | null = null;

const sessionRoom = (tableSessionId: string) => `session:${tableSessionId}`;

export function initSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_APP_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next) => {
    const sessionToken = socket.handshake.auth?.sessionToken as string | undefined;

    if (!sessionToken) {
      next(new Error("Session token missing"));
      return;
    }

    try {
      const tableSession = await prisma.tableSession.findUnique({ where: { sessionToken } });

      if (!tableSession || tableSession.status !== SessionStatus.ACTIVE) {
        next(new Error("Invalid or expired table session"));
        return;
      }

      socket.data.tableSessionId = tableSession.id;
      next();
    } catch {
      next(new Error("Failed to validate table session"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const tableSessionId = socket.data.tableSessionId as string;
    socket.join(sessionRoom(tableSessionId));
  });

  return io;
}

/** Broadcasts the latest cart state to every device joined to this table session. */
export function emitCartUpdate(tableSessionId: string, cart: unknown) {
  io?.to(sessionRoom(tableSessionId)).emit("cart:updated", cart);
}

/** Broadcasts the current order (placed, status change, or paid) to every device at the table. */
export function emitOrderUpdate(tableSessionId: string, order: unknown) {
  io?.to(sessionRoom(tableSessionId)).emit("order:updated", order);
}

/** Tells every device at the table their session just ended (bill settled, table freed). */
export function emitSessionClosed(tableSessionId: string) {
  io?.to(sessionRoom(tableSessionId)).emit("session:closed");
}
