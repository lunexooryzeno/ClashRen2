import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifyToken, JWTPayload } from "../lib/jwt.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        isAdmin: boolean;
        adminRole?: string | null;
      };
    }
  }
}

const COOKIE_NAME = "clash_zen_session";

function getSuperSecret(): string {
  return (process.env.JWT_SECRET ?? "dev_secret") + "_super_admin_2024_clash_zen";
}

function verifySuperAdminToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, getSuperSecret()) as { type?: string };
    return payload?.type === "super_admin";
  } catch { return false; }
}

function extractToken(req: Request): string | null {
  const cookie = req.cookies?.[COOKIE_NAME];
  if (cookie) return cookie;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

export function getTokenPayload(req: Request): JWTPayload | null {
  const token = extractToken(req);
  if (!token) return null;
  return verifyToken(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = getTokenPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  db.query.usersTable.findFirst({
    where: eq(usersTable.id, payload.userId),
    columns: { id: true, status: true, isAdmin: true, sessionVersion: true, adminRole: true, blockedReason: true, blockedUntil: true, deleteReason: true },
  })
    .then(user => {
      if (!user) {
        res.status(403).json({ error: "Account not found" });
        return;
      }
      if (user.status !== "active") {
        if (user.status === "blocked") {
          res.status(403).json({
            error: "Account blocked",
            suspended: true,
            status: "blocked",
            reason: user.blockedReason ?? null,
            blockedUntil: user.blockedUntil?.toISOString() ?? null,
          });
        } else {
          res.status(403).json({
            error: "Account deleted",
            suspended: true,
            status: "deleted",
            reason: user.deleteReason ?? null,
            blockedUntil: null,
          });
        }
        return;
      }
      if (payload.sv !== undefined && user.sessionVersion !== payload.sv) {
        res.status(401).json({ error: "Session expired. You have been logged in on another device.", code: "SESSION_SUPERSEDED" });
        return;
      }
      req.user = { userId: user.id, isAdmin: user.isAdmin, adminRole: user.adminRole };
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "Auth check failed" });
    });
}

/**
 * requireFullProfile — blocks exploratory (Google-only) users from core actions.
 * Must be placed AFTER requireAuth in the middleware chain.
 * Returns 403 with code "PHONE_REQUIRED" if the user has not linked a phone number.
 */
export function requireFullProfile(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.user.userId),
    columns: { isProfileComplete: true },
  })
    .then(user => {
      if (!user?.isProfileComplete) {
        res.status(403).json({
          error: "Complete your profile to perform this action. Enter a valid 10-digit phone number to unlock wallets and matches.",
          code: "PHONE_REQUIRED",
        });
        return;
      }
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "Profile check failed" });
    });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const superToken = req.headers["x-super-admin-token"];
  if (superToken && typeof superToken === "string" && verifySuperAdminToken(superToken)) {
    req.user = { userId: -1, isAdmin: true, adminRole: "admin" };
    return next();
  }

  requireAuth(req, res, () => {
    if (!req.user?.isAdmin && !req.user?.adminRole) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const superToken = req.headers["x-super-admin-token"];
  if (!superToken || typeof superToken !== "string" || !verifySuperAdminToken(superToken)) {
    res.status(401).json({ error: "Super admin token required" });
    return;
  }
  req.user = { userId: -1, isAdmin: true, adminRole: "admin" };
  next();
}

export function requireFinanceAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.userId === -1) return next();
  if (req.user?.adminRole !== "admin") {
    res.status(403).json({
      error: "Financial operations require Admin role. Moderators, Support, and Tournament Admins cannot manipulate wallets or prizes.",
      code: "INSUFFICIENT_ROLE",
    });
    return;
  }
  next();
}

export { getSuperSecret };
