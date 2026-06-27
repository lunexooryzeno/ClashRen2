import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET: string =
  process.env.JWT_SECRET ??
  (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable must be set in production. Configure it via the Replit Secrets panel."
      );
    }
    const generated = crypto.randomBytes(48).toString("hex");
    console.warn(
      "[jwt] JWT_SECRET not set — using an ephemeral secret. Sessions will be invalidated on server restart. Set JWT_SECRET via Replit Secrets for persistence."
    );
    return generated;
  })();

export interface JWTPayload {
  userId: number;
  phone?: string | null;
  isAdmin: boolean;
  sv: number;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as JWTPayload;
  } catch {
    return null;
  }
}
