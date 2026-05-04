import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

export const config = {
  archiveUrl: getEnv(
    "VARA_ARCHIVE_URL",
    "https://v2.archive.subsquid.io/network/vara-testnet"
  ),
  rpcUrl: getEnv("VARA_RPC_URL", "wss://archive-rpc.vara.network"),
  rateLimit: Number(getEnv("VARA_RPC_RATE_LIMIT", "20")),
  fromBlock: Number(getEnv("VARA_FROM_BLOCK", "26000000")),
  programId: getEnv(
    "VARA_PROGRAM_ID",
    "0xf275cf3ec5799dcfa7077130685355066e1af381384eb91d7f8e20ad5e7bb28e"
  ) as `0x${string}`,
  databaseUrl: getEnv(
    "DATABASE_URL",
    "postgres://postgres:postgres@localhost:5432/bolao_indexer"
  ),
  gqlPort: Number(getEnv("GQL_PORT", "4350")),
  frontendUrl: getEnv("FRONTEND_URL", "http://localhost:5173"),
  idlPath: resolve(__dirname, "../assets/bolao_program.idl"),
};
