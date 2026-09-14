import "dotenv/config";

export const CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "dineflow_super_secret_jwt_key_2026",
  SESSION_SECRET: process.env.SESSION_SECRET || "dineflow_session_secret_key_2026",
  JWT_EXPIRES_IN: "24h",
  SESSION_TOKEN_EXPIRES_IN: "12h",
};
