import { Router, Response } from "express";
import { verifyQrCode, joinSession } from "../controllers/sessionController";
import { validate } from "../middlewares/validateMiddleware";
import { verifyQrSchema, joinSessionSchema } from "../schemas/session.schema";
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

export default router;
