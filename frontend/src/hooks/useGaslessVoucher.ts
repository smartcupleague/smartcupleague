/**
 * useGaslessVoucher — React hook for gasless-tx voucher management.
 *
 * Design rules (from design doc):
 * - Cache only in memory (no localStorage). Server is the source of truth.
 * - At mount: GET /voucher/:account to pre-warm the cache.
 * - ensureVoucher(): return cached id if present; else POST → on 429/null → GET rescue.
 * - invalidateVoucher(): wipe cache so next ensureVoucher does POST.
 * - NEVER throws. Returns null when vouchers are unavailable.
 *
 * withVoucherSignAndSend is a named export (not a hook method).
 * It applies the 3-attempt retry pattern (with-voucher → retry-with-new-voucher → fallback-no-voucher).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoucher, postVoucher } from '@/utils/voucherClient';

// Programs covered by the voucher — BOTH required (see design ADR-5)
// If either is missing the feature is disabled: a voucher covering only one program
// would silently fail for tx types that need the other.
const BOLAO_PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string | undefined;
const FREEBET_LEDGER_ID = import.meta.env.VITE_FREEBET_LEDGER_ID as string | undefined;
const VOUCHER_PROGRAMS: string[] | null =
  BOLAO_PROGRAM_ID && FREEBET_LEDGER_ID
    ? [BOLAO_PROGRAM_ID, FREEBET_LEDGER_ID]
    : null;

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface VoucherState {
  voucherId: string | null;
  loading: boolean;
}

export interface UseGaslessVoucher {
  voucherId: string | null;
  loading: boolean;
  error: string | null;
  ensureVoucher: () => Promise<string | null>;
  invalidateVoucher: () => void;
}

/**
 * Factory that reconstructs a TransactionBuilder from scratch on every call.
 * CRITICAL: never reuse a builder across attempts — sails-js mutates _tx on signAndSend.
 */
export type TxFactory = () => any; // TransactionBuilder<unknown>

export interface SignAndSendResult {
  blockHash: string;
  response: () => Promise<unknown>;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useGaslessVoucher(account: string | undefined): UseGaslessVoucher {
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ref stays in sync with state on every render so ensureVoucher reads the
  // latest value without being recreated on every state change.
  const voucherRef = useRef<string | null>(null);
  voucherRef.current = voucherId;

  // Silent mount GET: pre-warm cache without showing a spinner.
  // Distinguishes 404 (no voucher yet, not an error) from backend failures.
  useEffect(() => {
    if (!account) {
      setVoucherId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await getVoucher(account);
      if (cancelled) return;
      if (!result.ok) {
        setError('Voucher backend unavailable');
      } else {
        setVoucherId(result.info?.voucherId ?? null);
      }
    })();

    return () => { cancelled = true; };
  }, [account]);

  /**
   * Guarantee a voucherId is available just before signing.
   * - Cache hit → return immediately (no HTTP)
   * - Cache miss → POST (emit/top-up); if 429/error → GET rescue
   */
  const ensureVoucher = useCallback(async (): Promise<string | null> => {
    if (!account || !VOUCHER_PROGRAMS) return null;
    if (voucherRef.current) return voucherRef.current; // fast path

    setLoading(true);
    setError(null);
    try {
      let id: string | null = null;

      const postInfo = await postVoucher(account, VOUCHER_PROGRAMS);
      if (postInfo?.voucherId) {
        id = postInfo.voucherId;
      } else {
        // POST returned null (rate-limited with no id, or error) → GET rescue
        const getResult = await getVoucher(account);
        if (!getResult.ok) {
          setError('Voucher backend unavailable — transactions will use normal gas');
        } else {
          id = getResult.info?.voucherId ?? null;
          if (!id) setError('Voucher unavailable — transactions will use normal gas');
        }
      }

      voucherRef.current = id;
      setVoucherId(id);
      return id;
    } finally {
      setLoading(false);
    }
  }, [account]);

  /**
   * Discard cached voucherId. Called by withVoucherSignAndSend after a tx
   * failure so the next ensureVoucher does a fresh POST (top-up / new).
   */
  const invalidateVoucher = useCallback(() => {
    voucherRef.current = null;
    setVoucherId(null);
  }, []);

  return { voucherId, loading, error, ensureVoucher, invalidateVoucher };
}

// ─── withVoucherSignAndSend ────────────────────────────────────────────────────

/**
 * Wraps a transaction in up to 3 attempts:
 * 1. With voucher (if ensureVoucher returns one)
 * 2. Invalidate + ensureVoucher again → retry with fresh voucher
 * 3. Fallback: sign without voucher (identical to today's behavior)
 *
 * The caller MUST supply a txFactory — a function that creates a FRESH
 * TransactionBuilder on every call. Never pass a pre-built instance.
 */
export async function withVoucherSignAndSend(params: {
  txFactory: TxFactory;
  account: string;
  signerOptions: { signer: unknown };
  value: bigint;
  ensureVoucher: () => Promise<string | null>;
  invalidateVoucher: () => void;
  /** Optional: pass when the handler uses calculateGas(false, 50). Omit for default. */
  calculateGas?: (tx: any) => Promise<void>;
}): Promise<SignAndSendResult> {
  const {
    txFactory,
    account,
    signerOptions,
    value,
    ensureVoucher,
    invalidateVoucher,
    calculateGas,
  } = params;

  /**
   * Build a fresh tx from the factory, apply account/value/voucher, calculate gas, send.
   * Each call to buildAndSend invokes txFactory() — NEVER reuses a builder.
   */
  const buildAndSend = async (voucherId: string | null): Promise<SignAndSendResult> => {
    const tx = txFactory(); // fresh builder
    tx.withAccount(account, signerOptions).withValue(value);
    if (voucherId) tx.withVoucher(voucherId);
    if (calculateGas) {
      await calculateGas(tx);
    } else {
      await tx.calculateGas();
    }
    return tx.signAndSend() as Promise<SignAndSendResult>;
  };

  // Attempt 1: with voucher (or direct path if no voucher available)
  const firstId = await ensureVoucher();
  if (!firstId) {
    // No voucher available → sign normally (current behavior, no regression)
    return buildAndSend(null);
  }

  try {
    return await buildAndSend(firstId);
  } catch {
    // Voucher attempt failed. Invalidate + top-up + retry.
    invalidateVoucher();

    let secondId: string | null = null;
    try {
      secondId = await ensureVoucher();
    } catch {
      secondId = null;
    }

    if (secondId) {
      try {
        // Attempt 2: fresh voucher
        return await buildAndSend(secondId);
      } catch {
        // Attempt 3: fallback without voucher (blind retry, design §7)
        return buildAndSend(null);
      }
    }

    // Could not get a second voucher → fallback without voucher
    return buildAndSend(null);
  }
}
