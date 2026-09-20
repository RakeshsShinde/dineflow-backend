import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import sessionRoutes from "./routes/sessionRoutes";
import tableRoutes from "./routes/tableRoutes";
import userRoutes from "./routes/userRoutes";
import menuRoutes from "./routes/menuRoutes";
import orderRoutes from "./routes/orderRoutes";
import superAdminRoutes from "./routes/superAdminRoutes";
import { globalErrorHandler, notFoundHandler } from "./middlewares/errorMiddleware";
import { initSocketServer } from "./realtime/socket";

const app = express();
const httpServer = http.createServer(app);

const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: process.env.CLIENT_APP_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register System Routes
app.use("/api/auth", authRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/admin/users", userRoutes);
app.use("/api/admin/tables", tableRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

initSocketServer(httpServer);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
