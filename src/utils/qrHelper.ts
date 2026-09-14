import crypto from "crypto";
import QRCode from "qrcode";
import { CONFIG } from "../config";

/**
 * Generates a signed, tamper-proof QR table code identifier using restaurantId UUID and tableNumber string.
 * Format: sig.R_{restaurantId}.T_{tableNumber}.{signature_hash}
 */
export const generateSignedQrCode = (restaurantId: string, tableNumber: string): string => {
  const rawPayload = `R_${restaurantId}.T_${tableNumber}`;
  const hmac = crypto
    .createHmac("sha256", CONFIG.SESSION_SECRET)
    .update(rawPayload)
    .digest("hex")
    .slice(0, 8); // 8-character signature hash

  return `sig.${rawPayload}.${hmac}`;
};

/**
 * Converts a target URL into a Base64 PNG Data URL for printing QR stickers
 */
export const generateQrCodeDataUrl = async (targetUrl: string): Promise<string> => {
  return QRCode.toDataURL(targetUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 300,
    color: {
      dark: "#0F172A",
      light: "#FFFFFF",
    },
  });
};

/**
 * Converts a target URL into a PNG Buffer for direct browser file download attachment
 */
export const generateQrCodeBuffer = async (targetUrl: string): Promise<Buffer> => {
  return QRCode.toBuffer(targetUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 400,
    color: {
      dark: "#0F172A",
      light: "#FFFFFF",
    },
  });
};

/**
 * Verifies a signed QR code payload string.
 * Format: sig.R_{restaurantId}.T_{tableNumber}.{signature_hash}
 */
export const verifySignedQrCode = (
  qrTableCode: string
): { restaurantId: string; tableNumber: string } | null => {
  if (!qrTableCode || typeof qrTableCode !== "string") return null;

  const parts = qrTableCode.split(".");
  // Expected parts: ["sig", "R_{restaurantId}", "T_{tableNumber}", "hash"]
  if (parts.length !== 4) return null;

  const [sigPrefix, rPart, tPart, hmacPart] = parts;
  if (sigPrefix !== "sig" || !rPart || !tPart || !hmacPart) return null;

  const restaurantId = rPart.replace(/^R_/, "");
  const tableNumberStr = tPart.replace(/^T_/, "");

  if (!restaurantId || !tableNumberStr) return null;

  // Re-generate expected signature
  const expectedQrCode = generateSignedQrCode(restaurantId, tableNumberStr);

  if (qrTableCode.length !== expectedQrCode.length) return null;

  const isValid = crypto.timingSafeEqual(
    Buffer.from(qrTableCode),
    Buffer.from(expectedQrCode)
  );

  return isValid ? { restaurantId, tableNumber: tableNumberStr } : null;
};
