import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireIndiaIP } from "./middleware/geo-restrict";
import { UPLOADS_DIR } from "./lib/dataDir.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app: Express = express();

// Trust the Replit reverse proxy so rate limiting uses the real client IP
app.set("trust proxy", 1);

// gzip/brotli compression — reduces response size by ~70% for JSON and text
app.use(compression());

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Allow requests from any Replit preview domain with credentials
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Global rate limit — 600 requests per 15 minutes per IP
// Admin requests (X-Super-Admin-Token) are skipped: they are already
// session-authenticated and should never hit a public IP cap.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
    skip: (req) => !!req.headers["x-super-admin-token"],
  })
);

// Stricter rate limit on auth endpoints — 60 attempts per 15 minutes per IP
// (keyed by IP; phone-level limiter enforces the real per-number cap)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
});

app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use("/api/auth/send-otp", authLimiter);
app.use("/api/auth/resend-otp", authLimiter);
app.use("/api/auth/verify-otp", authLimiter);
app.use("/api/auth/complete-login", authLimiter);

// Block all non-Indian IPs from the entire API (webhooks are exempt — they come from external servers)
app.use("/api", (req, res, next) => {
  if (req.path === "/webhook/payment") return next();
  requireIndiaIP(req, res, next);
});

// Serve uploaded banner images
app.use(
  "/api/admin/banners/uploads",
  express.static(join(UPLOADS_DIR, "banners"), {
    maxAge: "7d",
    immutable: false,
  }),
);

// Serve uploaded avatar/profile-picture images
app.use(
  "/api/users/uploads/avatars",
  express.static(join(UPLOADS_DIR, "avatars"), {
    maxAge: "7d",
    immutable: false,
  }),
);

// Serve uploaded tournament/match images
app.use(
  "/api/admin/tournaments/uploads",
  express.static(join(UPLOADS_DIR, "tournaments"), {
    maxAge: "7d",
    immutable: false,
  }),
);

// Serve dispute screenshot uploads
app.use(
  "/api/slots/uploads/disputes",
  express.static(join(UPLOADS_DIR, "disputes"), {
    maxAge: "7d",
    immutable: false,
  }),
);

app.use("/api", router);

// Serve the built React frontend so the whole app runs as a single Node.js
// process on a single port (e.g. Hostinger Node hosting). The bundled server
// lives in dist/index.mjs and the frontend build is copied to dist/public.
// Falls back to index.html for client-side (SPA) routing.
const publicDir = join(__dirname, "public");
if (existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      index: false,
      maxAge: "1h",
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    // Only serve the SPA shell for client-side routes (no file extension).
    // Asset-like requests (containing a ".") that reach here are real 404s,
    // so let Express return 404 instead of masking them with index.html.
    if (req.path.includes(".")) return next();
    res.sendFile(join(publicDir, "index.html"));
  });
}

export default app;
