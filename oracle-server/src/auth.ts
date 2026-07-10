import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Constant-time, fail-closed admin token check.
 * Returns false if either side is empty (so an unset ADMIN_API_TOKEN rejects everything),
 * and compares sha256 digests so the check neither leaks length nor throws on a length
 * mismatch (crypto.timingSafeEqual requires equal-length buffers).
 */
export function adminTokenMatches(provided: string, expected: string): boolean {
  if (!expected || !provided) return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Express guard for admin/operator WRITE endpoints. Requires header `x-admin-token`
 * to match process.env.ADMIN_API_TOKEN. Fails closed and never logs the token value.
 */
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header("x-admin-token") ?? "";
  if (!adminTokenMatches(provided, process.env.ADMIN_API_TOKEN ?? "")) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}
