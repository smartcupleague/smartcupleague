import { config } from 'dotenv';

config();

const required = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`${name} is not set`);
  return val;
};

const posInt = (name: string, defaultValue: string): number => {
  const raw = process.env[name] ?? defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer (got "${raw}")`);
  }
  return n;
};

const positiveBigInt = (name: string, defaultValue: bigint): bigint => {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = BigInt(raw.trim());
  if (n <= 0n) throw new Error(`${name} must be a positive integer (got "${raw}")`);
  return n;
};

const bool = (name: string, defaultValue: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} must be a boolean (got "${raw}")`);
};

const csv = (name: string, defaultValue: string[]): string[] => {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

export default () => ({
  port: posInt('PORT', '3002'),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: posInt('DB_PORT', '5432'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    name: required('DB_NAME'),
    synchronize: bool('DB_SYNCHRONIZE', process.env.NODE_ENV !== 'production'),
  },
  nodeUrl: required('NODE_URL'),
  corsOrigins: csv('CORS_ORIGINS', []),
  freebetLedgerId: required('FREEBET_LEDGER_ID'),
  rewardsAccount: required('REWARDS_ACCOUNT'),
  chainDisabled: bool('CHAIN_DISABLED', false),
  xBearerToken: required('X_BEARER_TOKEN'),
  smartCupXUsername: process.env.SMARTCUP_X_USERNAME || 'SmartCupLeague',
  smartCupAppUrl: process.env.SMARTCUP_APP_URL || 'https://app.smartcupleague.com/',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  xRepostAmountVara: positiveBigInt('X_REPOST_AMOUNT_VARA', 100n),
  xPostAmountVara: positiveBigInt('X_POST_AMOUNT_VARA', 300n),
});
