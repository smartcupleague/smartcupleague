import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';

export function toHexAddress(input?: string | null): `0x${string}` | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('0x')) return trimmed.toLowerCase() as `0x${string}`;

  try {
    return u8aToHex(decodeAddress(trimmed)).toLowerCase() as `0x${string}`;
  } catch {
    return null;
  }
}

export function shortAddress(input?: string | null): string {
  if (!input) return '-';
  const hex = toHexAddress(input) ?? input;
  return hex.startsWith('0x') && hex.length > 14 ? `${hex.slice(0, 6)}...${hex.slice(-4)}` : hex;
}
