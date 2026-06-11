/**
 * voucherClient — pure HTTP I/O for the gasless voucher backend.
 *
 * Rules:
 * - NEVER throws. Every function is wrapped in try/catch and returns null on any error.
 * - If VITE_VOUCHER_URL is not defined → return null immediately (no fetch).
 * - Uses AbortSignal.timeout(5000) identical to useVaraPrice.ts pattern.
 */

const VOUCHER_URL = import.meta.env.VITE_VOUCHER_URL as string | undefined;

export interface VoucherInfo {
  /** ID of the usable voucher; null means no voucher is available right now. */
  voucherId: string | null;
  /** false = backend could not read on-chain balance (do NOT assume 0). */
  balanceKnown: boolean;
  /** planck as string, present only when balanceKnown is true. */
  balance?: string | null;
}

/** Shape of a backend 429 response that carries a rate-limit but NOT a voucherId. */
interface RateLimitedBody {
  error?: string;
  nextEligibleAt?: string;
}

/** Internal helper: parse any backend JSON body into a VoucherInfo, or return null. */
function parseVoucherBody(body: unknown): VoucherInfo | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  // Must have at least a voucherId field (possibly null for future proofing)
  if (!('voucherId' in b)) return null;

  return {
    voucherId: typeof b.voucherId === 'string' ? b.voucherId : null,
    balanceKnown: typeof b.balanceKnown === 'boolean' ? b.balanceKnown : false,
    balance: typeof b.balance === 'string' ? b.balance : null,
  };
}

/**
 * GET /voucher/:account
 * - 200 → { ok: true, info: VoucherInfo }
 * - 404 → { ok: true, info: null }  (no voucher yet — not an error)
 * - timeout / CORS / 5xx / network → { ok: false, reason: string }
 */
export type GetVoucherResult =
  | { ok: true; info: VoucherInfo | null }
  | { ok: false; reason: string };

export async function getVoucher(
  account: string,
  signal?: AbortSignal,
): Promise<GetVoucherResult> {
  if (!VOUCHER_URL) return { ok: true, info: null };
  try {
    const res = await fetch(`${VOUCHER_URL}/voucher/${account}`, {
      signal: signal ?? AbortSignal.timeout(5000),
    });
    if (res.status === 404) return { ok: true, info: null };
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: true, info: parseVoucherBody(body) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Network error' };
  }
}

/**
 * POST /voucher { account, programs }
 *
 * Branch mapping:
 * - 201 (new voucher)                        → VoucherInfo
 * - 200 with voucherId (top-up or cooldown C) → VoucherInfo
 * - 429 with voucherId in body (branch C)    → VoucherInfo
 * - 429 WITHOUT voucherId (pure rate-limit)  → null (caller does GET rescue)
 * - 5xx / timeout / CORS / network           → null
 */
export async function postVoucher(
  account: string,
  programs: string[],
  signal?: AbortSignal,
): Promise<VoucherInfo | null> {
  if (!VOUCHER_URL) return null;
  try {
    const res = await fetch(`${VOUCHER_URL}/voucher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, programs }),
      signal: signal ?? AbortSignal.timeout(5000),
    });

    if (res.status === 201 || res.status === 200) {
      const body = await res.json();
      return parseVoucherBody(body);
    }

    if (res.status === 429) {
      // Branch C: 429 WITH voucherId → return it so caller can use it
      // Branch rate-limit: 429 WITHOUT voucherId → return null, caller does GET rescue
      try {
        const body = await res.json() as RateLimitedBody & Partial<VoucherInfo>;
        if (body && typeof (body as any).voucherId === 'string') {
          return parseVoucherBody(body);
        }
      } catch { /* body parse failed */ }
      return null;
    }

    // 5xx or anything unexpected
    return null;
  } catch {
    return null;
  }
}
