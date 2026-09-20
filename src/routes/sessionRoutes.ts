import { Router, Response } from "express";
import { verifyQrCode, joinSession } from "../controllers/sessionController";
import { getCart, updateCartItem } from "../controllers/cartController";
import { placeOrder, getCurrentOrder } from "../controllers/orderController";
import { validate } from "../middlewares/validateMiddleware";
import { verifyQrSchema, joinSessionSchema } from "../schemas/session.schema";
import { updateCartItemSchema } from "../schemas/cart.schema";
import { validateTableSession, SessionRequest } from "../middlewares/sessionMiddleware";

const router = Router();

// Public customer endpoints
router.get("/verify-qr", validate({ query: verifyQrSchema }), verifyQrCode);
router.post("/join", validate({ body: joinSessionSchema }), joinSession);

// Customer session self check
router.get("/current", validateTableSession, (req: SessionRequest, res: Response) => {
    res.status(200).json({
        success: true,
        tableSession: req.tableSession,
    });
});

// Shared cart — every device joined to the same table session reads/writes these
router.get("/cart", validateTableSession, getCart);
router.post("/cart/items", validateTableSession, validate({ body: updateCartItemSchema }), updateCartItem);

// Orders — placing one converts the shared cart into a real order; every
// device at the table can poll/subscribe for the current order's status.
router.post("/orders", validateTableSession, placeOrder);
router.get("/order", validateTableSession, getCurrentOrder);

export default router;
