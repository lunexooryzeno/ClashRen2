import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { UPLOADS_DIR as UPLOADS_BASE } from "../lib/dataDir.js";

const UPLOADS_DIR = join(UPLOADS_BASE, "avatars");
mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg":  ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
  "image/gif":  ".gif",
};

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const router: IRouter = Router();

router.post(
  "/users/me/upload-photo",
  requireAuth,
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

    req.on("end", () => {
      if (aborted) return;
      if (chunks.length === 0) {
        res.status(400).json({ error: "No file data received." });
        return;
      }

      const ext = ALLOWED_MIME[ct] ?? ".jpg";
      const filename = `${randomUUID()}${ext}`;
      const filePath = join(UPLOADS_DIR, filename);

      const buf = Buffer.concat(chunks);
      const ws = createWriteStream(filePath);
      ws.write(buf);
      ws.end();
      ws.on("finish", () => {
        res.json({ url: `/api/users/uploads/avatars/${filename}` });
      });
      ws.on("error", (err) => {
        req.log.error({ err }, "Failed to save avatar image");
        res.status(500).json({ error: "Failed to save image file." });
      });
    });

    req.on("error", (err) => {
      if (!aborted) {
        req.log.error({ err }, "Request error during avatar upload");
        res.status(500).json({ error: "Upload stream error." });
      }
    });
  },
);

export default router;
