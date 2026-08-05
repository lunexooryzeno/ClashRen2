import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdmin } from "../middlewares/auth.js";
import { saveMediaUpload } from "../lib/mediaDb.js";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_SIZE = 5 * 1024 * 1024;

const router: IRouter = Router();

router.post(
  "/admin/tournaments/upload-image",
  requireAdmin,
  (req: Request, res: Response) => {
    const ct = (req.headers["content-type"] ?? "").split(";")[0].trim();
    if (!ALLOWED_MIME[ct]) {
      res.status(400).json({ error: `File type not allowed. Allowed: JPEG, PNG, WebP, GIF. Got: ${ct}` });
      return;
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        aborted = true;
        req.destroy();
        res.status(400).json({ error: "File too large. Maximum size is 5 MB." });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", async () => {
      if (aborted) return;
      if (chunks.length === 0) {
        res.status(400).json({ error: "No file data received." });
        return;
      }

      try {
        const buf = Buffer.concat(chunks);
        const id = await saveMediaUpload(ct, buf);
        res.json({ url: `/api/uploads/${id}` });
      } catch (err) {
        req.log.error({ err }, "Failed to save tournament image to database");
        res.status(500).json({ error: "Failed to save image." });
      }
    });

    req.on("error", (err) => {
      if (!aborted) {
        req.log.error({ err }, "Request error during tournament image upload");
        res.status(500).json({ error: "Upload stream error." });
      }
    });
  },
);

export default router;
