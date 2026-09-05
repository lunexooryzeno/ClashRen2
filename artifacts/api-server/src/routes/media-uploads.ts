/**
 * GET /api/uploads/:id
 *
 * Stream a DB-backed image upload back to the client.
 * These URLs are stable across every deployment environment because the data
 * lives in the shared external PostgreSQL database, not on local disk.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { getMediaUpload } from "../lib/mediaDb.js";
import { getTokenPayload } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/uploads/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  // Basic UUID-shape guard to avoid DB calls for obviously bad IDs
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const record = await getMediaUpload(id);
    if (!record) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const payload = getTokenPayload(req);
    const canRead = record.accessScope === "public"
      || (payload && !payload.guest && (
        payload.isAdmin
        || record.ownerUserId === payload.userId
      ));
    if (!canRead) {
      res.status(payload ? 403 : 401).json({
        error: payload ? "Forbidden" : "Unauthorized",
        ...(payload?.guest ? { code: "GUEST_RESTRICTED" } : {}),
      });
      return;
    }

    res.setHeader("Content-Type", record.mimeType);
    res.setHeader("Content-Length", record.data.length);
    res.setHeader(
      "Cache-Control",
      record.accessScope === "public"
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
    );
    res.end(record.data);
  } catch (err) {
    req.log.error({ err }, "Failed to serve media upload");
    res.status(500).json({ error: "Failed to serve image" });
  }
});

export default router;
