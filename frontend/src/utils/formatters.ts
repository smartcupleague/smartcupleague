/**
 * Centralized formatting utilities for SmartCup League.
 * Import from here to keep numeric and currency formats consistent.
 */

const VARA_DECIMALS = 12;

/** Parse any value safely to bigint. Returns 0n on failure. */
export function safeBigInt(input: unknown): bigint {
  try {
    if (typeof input === 'bigint') return input;
    if (typeof input === 'number') return BigInt(Math.trunc(input));
    if (typeof input === 'string') {
      const s = input.trim().replace(/,/g, '');
      if (!s) return 0n;
      return BigInt(s);
    }
    return 0n;
  } catch {
    return 0n;
  }
}

/**
 * Format planck amount to VARA with full precision.
 * e.g. 17000000000000n → "17"
 */
export function formatVara(planck: bigint | string | number): string {
  const bn = safeBigInt(planck);
  const divisor = BigInt(10) ** BigInt(VARA_DECIMALS);
  const intVal = bn / divisor;
  const frac = (bn % divisor).toString().padStart(VARA_DECIMALS, '0').replace(/0+$/, '');
  return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
}

/**
 * Format planck amount to VARA with 1 decimal place.
 * e.g. 17500000000000n → "17.5", 42000000000000n → "42.0"
 * Used for Prediction Stake display.
 */
export function formatStake1dp(planck: bigint | string | number): string {
  const vara = Number(safeBigInt(planck)) / 1e12;
  return vara.toFixed(1);
}

/**
 * Format planck amount to VARA with 2 decimal places, with thousands separator.
 * e.g. 1234567890000000n → "1,234.57"
 */
export function formatVaraCompact(planck: bigint | string | number): string {
  const vara = Number(safeBigInt(planck)) / 1e12;
  return vara.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a raw string/bigint pool value (already in planck) to human-readable VARA.
 * Returns "—" if the value is zero or invalid.
 */
export function formatPoolAmount(val: unknown, decimals = VARA_DECIMALS): string {
  if (val === null || val === undefined) return '—';

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '—' || s === '-') return '—';
    const cleaned = s.replace(/,/g, '');
    if (!/^-?\d+$/.test(cleaned)) return '—';
    val = cleaned;
  }

  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '—';
    val = Math.trunc(val);
  }

  try {
    const bn = typeof val === 'bigint' ? val : BigInt(val as string | number);
    if (bn === 0n) return '—';
    const divisor = BigInt(10) ** BigInt(decimals);
    const intVal = bn / divisor;
    const frac = (bn % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${intVal.toString()}.${frac}` : intVal.toString();
  } catch {
    return '—';
  }
}

/**
 * Convert VARA amount (as a number of whole VARA) to a USD string.
 * Pass the live rate obtained from useVaraPrice(); falls back to VARA_USD_FALLBACK_RATE.
 */
export const VARA_USD_FALLBACK_RATE = 0.0; // shown as "—" until the API responds

export function varaToUsdString(varaAmount: number, rate = VARA_USD_FALLBACK_RATE): string {
  if (!rate || rate <= 0) return '';
  const usd = varaAmount * rate;
  if (usd < 0.001) return '< $0.01';
  return `≈ $${usd.toFixed(2)}`;
}

/**
 * Convert planck amount to a USD string.
 */
export function planckToUsdString(planck: bigint | string | number, rate = VARA_USD_FALLBACK_RATE): string {
  if (!rate || rate <= 0) return '';
  const vara = Number(safeBigInt(planck)) / 1e12;
  return varaToUsdString(vara, rate);
}
