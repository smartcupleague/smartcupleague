import "dotenv/config.js";
import fs from "fs";
import path from "path";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { GearApi } from "@gear-js/api";
import { Keyring } from "@polkadot/keyring";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";

import { Program as OracleProgram, PenaltyWinner } from "./oracle";
import { BolaoProgram } from "./bolao";
import { resolveOnFieldResult, type MappedResult } from "./result-mapping";
import { runPriceFeed } from "./price-feed";
import { classifyMatch, availableActionsFor, type CaseLabel } from "./finalization-utils";

/* ============================================================
   ENV
   ============================================================ */
const PORT = intEnv("PORT", 3001);
const VARA_WS = mustEnv("VARA_WS");
const ORACLE_PROGRAM_ID = mustEnv("ORACLE_PROGRAM_ID") as `0x${string}`;
const BOLAO_PROGRAM_ID = (process.env.BOLAO_PROGRAM_ID ?? "") as `0x${string}`;
const GATEWAY_SEED = mustEnv("GATEWAY_SEED");
const OPERATOR_SEED = process.env.OPERATOR_SEED ?? "";
const SPORTS_API_KEY = process.env.SPORTS_API_KEY ?? "";
const SPORTS_COMPETITION_CODE = process.env.SPORTS_COMPETITION_CODE ?? "WC";
const FRIENDLIES_COMPETITION_CODES = process.env.FRIENDLIES_COMPETITION_CODES ?? "";
const AUTO_FEED_INTERVAL_MS   = intEnv("AUTO_FEED_INTERVAL_MS",   120_000);
const CHALLENGE_WINDOW_MS     = intEnv("CHALLENGE_WINDOW_MS",     2 * 60 * 1000); // 2 min default
const FINALIZE_BUFFER_MS      = intEnv("FINALIZE_BUFFER_MS",      15_000);        // 15 s safety buffer
const PRICE_FEED_INTERVAL_MS  = intEnv("PRICE_FEED_INTERVAL_MS",  600_000);       // 10 min default
const NATIVE_DECIMALS = 12;

// R-D3 mitigation: price feed interval must be at least 60 seconds to avoid
// hammering CoinGecko (free tier rate limit) and spamming the chain.
if (PRICE_FEED_INTERVAL_MS < 60_000) {
  throw new Error(
    `PRICE_FEED_INTERVAL_MS must be >= 60000 (got ${PRICE_FEED_INTERVAL_MS}). ` +
    `Set it to at least 60000 (60 s) to respect CoinGecko rate limits.`,
  );
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ============================================================
   SPORTS API (football-data.org)
   Docs: https://www.football-data.org/documentation/quickstart
   Free tier: 10 req/min, covers World Cup 2026 (code = "WC")
   ============================================================ */
const SPORTS_BASE_URL = "https://api.football-data.org/v4";

interface SportScore {
  home: number | null;
  away: number | null;
}

interface SportMatch {
  id: number;
  status: string;
  score: {
    winner: string | null;
    duration: string;
    fullTime: SportScore;
    penalties: SportScore;
  };
}

/* World Cup enriched types (football-data.org v4) */
interface WCTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

interface WCFixture {
  id: number;
  matchday: number | null;
  stage: string;
  group: string | null;
  status: string;
  utcDate: string;
  homeTeam: WCTeam;
  awayTeam: WCTeam;
  score: {
    winner: string | null;
    duration: string;
    fullTime: SportScore;
    halfTime: SportScore;
    penalties: SportScore;
  };
}

interface WCStandingRow {
  position: number;
  team: WCTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

interface WCStandingGroup {
  stage: string;
  type: string;
  group: string;
  table: WCStandingRow[];
}

async function fetchSportMatch(matchId: number): Promise<SportMatch> {
  const cacheKey = `match:${matchId}`;
  const cached = getCached<SportMatch>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${SPORTS_BASE_URL}/matches/${matchId}`, {
    headers: buildSportsHeaders(),
  });
  if (!res.ok) {
    throw new Error(`sports-api /matches/${matchId} → ${res.status} ${res.statusText}`);
  }
  const match = (await res.json()) as SportMatch;
  // Only cache finished matches indefinitely (score won't change).
  // Non-finished matches use short TTL so we re-check soon.
  const ttl = match.status === "FINISHED" ? FIXTURES_TTL_MS : MATCH_TTL_MS;
  setCached(cacheKey, match, ttl);
  return match;
}

async function fetchFinishedMatchesForCompetition(): Promise<SportMatch[]> {
  const res = await fetch(
    `${SPORTS_BASE_URL}/competitions/${SPORTS_COMPETITION_CODE}/matches?status=FINISHED`,
    { headers: buildSportsHeaders() },
  );
  if (!res.ok) {
    throw new Error(
      `sports-api /competitions/${SPORTS_COMPETITION_CODE}/matches → ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { matches: SportMatch[] };
  return body.matches ?? [];
}

function buildSportsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SPORTS_API_KEY) headers["X-Auth-Token"] = SPORTS_API_KEY;
  return headers;
}

/* ── In-memory cache for sports-api responses ──────────────────────────────
 * football-data.org free tier: 10 req/min.
 * Cache TTL:
 *   - WC fixtures / standings / teams : 5 min  (slow-changing data)
 *   - Individual match result          : 2 min  (only needed for finished matches)
 */
interface CacheEntry<T> { data: T; expiresAt: number }
const sportsCache = new Map<string, CacheEntry<unknown>>();

// Accumulated crests from every fixture fetch — persists for the lifetime of the process
const crestsAccumulator: Record<string, string> = {};

function populateCrests(fixtures: WCFixture[]): void {
  for (const m of fixtures) {
    if (m.homeTeam?.name && m.homeTeam?.crest) crestsAccumulator[m.homeTeam.name] = m.homeTeam.crest;
    if (m.homeTeam?.shortName && m.homeTeam?.crest) crestsAccumulator[m.homeTeam.shortName] = m.homeTeam.crest;
    if (m.awayTeam?.name && m.awayTeam?.crest) crestsAccumulator[m.awayTeam.name] = m.awayTeam.crest;
    if (m.awayTeam?.shortName && m.awayTeam?.crest) crestsAccumulator[m.awayTeam.shortName] = m.awayTeam.crest;
  }
}

function getCached<T>(key: string): T | null {
  const entry = sportsCache.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  sportsCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const FIXTURES_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const MATCH_TTL_MS    = 2 * 60 * 1000;   // 2 minutes

/* ── Match ID mapping (persistent) ─────────────────────────────────────────
 * BolaoCore and Oracle-Program both use the same sequential match_id (1, 2, 3…).
 * Football-data.org uses large numeric IDs (419078, …).
 * This mapping lets the auto-feeder resolve the sports-API ID from the
 * sequential ID stored on-chain.
 *
 * Populated by POST /setup/sync-tournament.
 * Persisted to DATA_DIR/match-mapping.json so it survives restarts.
 */
const DATA_DIR = path.resolve("./data");
const MATCH_MAPPING_FILE  = path.join(DATA_DIR, "match-mapping.json");
const KICK_OFF_MAP_FILE   = path.join(DATA_DIR, "kick-off-map.json");

/** sequential bolao/oracle match_id  →  football-data.org sports API ID */
const matchIdToSportsId = new Map<number, number>();
/** football-data.org sports API ID  →  sequential bolao/oracle match_id */
const sportsIdToMatchId = new Map<number, number>();
/** sequential bolao/oracle match_id  →  kick-off timestamp (ms) */
const kickOffMap = new Map<number, number>();

function loadMatchMapping(): void {
  try {
    if (!fs.existsSync(MATCH_MAPPING_FILE)) return;
    const raw = fs.readFileSync(MATCH_MAPPING_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, number>;
    matchIdToSportsId.clear();
    sportsIdToMatchId.clear();
    for (const [k, v] of Object.entries(parsed)) {
      const mid = Number(k);
      matchIdToSportsId.set(mid, v);
      sportsIdToMatchId.set(v, mid);
    }
    console.log(`[mapping] Loaded ${matchIdToSportsId.size} match ID mappings from ${MATCH_MAPPING_FILE}`);
  } catch (e: any) {
    console.warn("[mapping] Failed to load match mapping:", e?.message);
  }
}

function loadKickOffMap(): void {
  try {
    if (!fs.existsSync(KICK_OFF_MAP_FILE)) return;
    const raw = fs.readFileSync(KICK_OFF_MAP_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, number>;
    kickOffMap.clear();
    for (const [k, v] of Object.entries(parsed)) kickOffMap.set(Number(k), v);
    console.log(`[mapping] Loaded ${kickOffMap.size} kick-off entries from ${KICK_OFF_MAP_FILE}`);
  } catch (e: any) {
    console.warn("[mapping] Failed to load kick-off map:", e?.message);
  }
}

function addMatchMapping(bolaoMatchId: number, sportsApiId: number): void {
  matchIdToSportsId.set(bolaoMatchId, sportsApiId);
  sportsIdToMatchId.set(sportsApiId, bolaoMatchId);
}

function addKickOff(bolaoMatchId: number, kickOffMs: number): void {
  kickOffMap.set(bolaoMatchId, kickOffMs);
}

function saveMatchMapping(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj: Record<string, number> = {};
    matchIdToSportsId.forEach((v, k) => { obj[String(k)] = v; });
    fs.writeFileSync(MATCH_MAPPING_FILE, JSON.stringify(obj, null, 2));
    console.log(`[mapping] Saved ${matchIdToSportsId.size} entries to ${MATCH_MAPPING_FILE}`);
  } catch (e: any) {
    console.warn("[mapping] Failed to save match mapping:", e?.message);
  }
}

function saveKickOffMap(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj: Record<string, number> = {};
    kickOffMap.forEach((v, k) => { obj[String(k)] = v; });
    fs.writeFileSync(KICK_OFF_MAP_FILE, JSON.stringify(obj, null, 2));
  } catch (e: any) {
    console.warn("[mapping] Failed to save kick-off map:", e?.message);
  }
}

/**
 * Rebuilds matchIdToSportsId and kickOffMap from Oracle on-chain data + football-data.org.
 * Called at boot when the JSON files are missing (e.g. after a Render redeploy wipes the fs).
 *
 * kickOffMap  → rebuilt entirely from Oracle (no external API needed).
 * matchIdToSportsId → resolved by matching home/away names + kick_off against WC fixtures.
 * Unresolved entries are logged clearly — never guessed.
 * Use POST /setup/repair-mapping to fix any unresolved entries manually.
 */
async function rebuildMappingFromChain(oracle: OracleProgram): Promise<void> {
  console.log("[mapping-rebuild] JSON files missing — rebuilding from on-chain data...");

  let onChainMatches: Awaited<ReturnType<typeof oracle.service.queryAllResults>>;
  try {
    onChainMatches = await oracle.service.queryAllResults();
  } catch (e: any) {
    console.error("[mapping-rebuild] queryAllResults failed:", e?.message);
    return;
  }
  if (onChainMatches.length === 0) {
    console.warn("[mapping-rebuild] Oracle has no registered matches — nothing to rebuild");
    return;
  }

  // kickOffMap: kick_off is stored verbatim on-chain — no API needed
  for (const r of onChainMatches) {
    const mid = Number(r.match_id);
    const ko  = Number(r.kick_off);
    if (mid > 0 && ko > 0) kickOffMap.set(mid, ko);
  }
  saveKickOffMap();
  console.log(`[mapping-rebuild] kickOffMap rebuilt: ${kickOffMap.size} entries`);

  // matchIdToSportsId: match by team names + kick_off against WC fixtures
  let fixtures: WCFixture[];
  try {
    fixtures = await fetchWCFixtures();
  } catch (e: any) {
    console.error("[mapping-rebuild] fetchWCFixtures failed:", e?.message);
    console.warn("[mapping-rebuild] kickOffMap saved but matchIdToSportsId NOT rebuilt.");
    console.warn("[mapping-rebuild] Use POST /setup/repair-mapping to add entries manually.");
    return;
  }

  // kick_off was stored as new Date(utcDate).getTime() — should match exactly.
  // 60s tolerance handles any edge cases (DST, clock skew at registration time).
  const KICK_OFF_TOLERANCE_MS = 60_000;
  const unresolved: Array<{ match_id: number; home: string; away: string; kick_off: string }> = [];

  for (const r of onChainMatches) {
    const mid    = Number(r.match_id);
    const kickMs = Number(r.kick_off);

    const fixture = fixtures.find((f) => {
      const fKickMs = new Date(f.utcDate).getTime();
      return (
        f.homeTeam.name === r.home &&
        f.awayTeam.name === r.away &&
        Math.abs(fKickMs - kickMs) < KICK_OFF_TOLERANCE_MS
      );
    });

    if (fixture) {
      addMatchMapping(mid, fixture.id);
    } else {
      unresolved.push({
        match_id: mid,
        home: String(r.home),
        away: String(r.away),
        kick_off: new Date(kickMs).toISOString(),
      });
    }
  }

  if (matchIdToSportsId.size > 0) saveMatchMapping();

  console.log(`[mapping-rebuild] matchIdToSportsId rebuilt: ${matchIdToSportsId.size}/${onChainMatches.length} resolved`);

  if (unresolved.length > 0) {
    console.warn(`[mapping-rebuild] ${unresolved.length} match(es) could NOT be auto-resolved:`);
    for (const u of unresolved) {
      console.warn(`  match_id=${u.match_id}  "${u.home}" vs "${u.away}"  kick_off=${u.kick_off}`);
    }
    console.warn("[mapping-rebuild] Fix with: POST /setup/repair-mapping  { bolao_match_id, sports_api_id }");
  } else {
    console.log("[mapping-rebuild] All matches resolved ✓");
  }
}

async function fetchWCFixtures(status?: string): Promise<WCFixture[]> {
  const cacheKey = `wc-fixtures:${status ?? "all"}`;
  const cached = getCached<WCFixture[]>(cacheKey);
  if (cached) return cached;

  const url = status
    ? `${SPORTS_BASE_URL}/competitions/WC/matches?status=${encodeURIComponent(status)}`
    : `${SPORTS_BASE_URL}/competitions/WC/matches`;
  const res = await fetch(url, { headers: buildSportsHeaders() });
  if (!res.ok) {
    throw new Error(`sports-api WC/matches → ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { matches: WCFixture[] };
  const matches = body.matches ?? [];
  setCached(cacheKey, matches, FIXTURES_TTL_MS);
  populateCrests(matches);
  return matches;
}

async function fetchWCStandings(): Promise<WCStandingGroup[]> {
  const cacheKey = "wc-standings";
  const cached = getCached<WCStandingGroup[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${SPORTS_BASE_URL}/competitions/WC/standings`, {
    headers: buildSportsHeaders(),
  });
  if (!res.ok) {
    throw new Error(`sports-api WC/standings → ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { standings: WCStandingGroup[] };
  setCached(cacheKey, body.standings ?? [], FIXTURES_TTL_MS);
  return body.standings ?? [];
}

// Free-tier competition IDs on football-data.org
// WC=2000, CL=2001, BL1=2002, DED=2003, BSA=2013, PD=2014, FL1=2015, ELC=2016, PPL=2017, EC=2018, SA=2019, PL=2021
const FREE_TIER_COMPETITIONS = "2000,2001,2002,2003,2013,2014,2015,2016,2017,2018,2019,2021";

async function fetchFriendliesInWindow(days = 14): Promise<WCFixture[]> {
  const now = new Date();
  const from = now.toISOString().split("T")[0];
  const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const cacheKey = `friendlies:${from}:${days}`;
  const cached = getCached<WCFixture[]>(cacheKey);
  if (cached) return cached;

  const competitions = FRIENDLIES_COMPETITION_CODES || FREE_TIER_COMPETITIONS;
  const url = `${SPORTS_BASE_URL}/matches?dateFrom=${from}&dateTo=${to}&competitions=${competitions}`;

  const res = await fetch(url, { headers: buildSportsHeaders() });
  if (!res.ok) {
    throw new Error(`sports-api /matches → ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { matches: WCFixture[] };
  const matches = body.matches ?? [];
  setCached(cacheKey, matches, FIXTURES_TTL_MS);
  populateCrests(matches);
  return matches;
}

async function fetchWCTeams(): Promise<WCTeam[]> {
  const cacheKey = "wc-teams";
  const cached = getCached<WCTeam[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${SPORTS_BASE_URL}/competitions/WC/teams`, {
    headers: buildSportsHeaders(),
  });
  if (!res.ok) {
    throw new Error(`sports-api WC/teams → ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { teams: WCTeam[] };
  setCached(cacheKey, body.teams ?? [], FIXTURES_TTL_MS);
  return body.teams ?? [];
}

/**
 * Map a SportMatch to Oracle-Program inputs.
 * Returns null if the match is not finished / scores are missing / data is inconsistent.
 * The on-field resolution (penalty-shootout handling, guards) lives in ./result-mapping.
 */
function mapMatchToOracle(m: SportMatch): MappedResult | null {
  if (m.status !== "FINISHED") return null;
  return resolveOnFieldResult(m.score, String(m.id));
}

/* ============================================================
   VARA / GearApi
   ============================================================ */
let gearApi: GearApi | null = null;

async function getApi(): Promise<GearApi> {
  if (gearApi) return gearApi;
  gearApi = await GearApi.create({ providerAddress: VARA_WS });
  gearApi?.provider?.on?.("error", (e: any) => console.error("[GearApi] error:", e));
  gearApi?.provider?.on?.("disconnected", () => console.warn("[GearApi] disconnected"));
  gearApi?.provider?.on?.("connected", () => console.log("[GearApi] connected"));
  return gearApi;
}

function getGatewaySigner() {
  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(GATEWAY_SEED);
}

function getOperatorSigner() {
  if (!OPERATOR_SEED) throw new Error("OPERATOR_SEED is not configured — operator endpoints unavailable");
  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(OPERATOR_SEED);
}

function getOracle(api: GearApi): OracleProgram {
  return new OracleProgram(api, ORACLE_PROGRAM_ID);
}

function getBolao(api: GearApi): BolaoProgram {
  if (!BOLAO_PROGRAM_ID) throw new Error("BOLAO_PROGRAM_ID is not set in .env");
  return new BolaoProgram(api, BOLAO_PROGRAM_ID);
}

function ss58PrefixFromApi(api: GearApi): number | undefined {
  const p = (api as any)?.registry?.chainSS58;
  return typeof p === "number" ? p : undefined;
}

function toHexAddress(addrSs58OrHex: string): `0x${string}` {
  if (addrSs58OrHex.startsWith("0x") && addrSs58OrHex.length === 66) {
    return addrSs58OrHex as `0x${string}`;
  }
  return u8aToHex(decodeAddress(addrSs58OrHex)) as `0x${string}`;
}

function asActorId(x: unknown, field: string): `0x${string}` {
  const s = String(x ?? "").trim();
  if (!s) throw new Error(`${field} is required`);
  return toHexAddress(s);
}

function asMatchId(x: unknown, field: string): bigint {
  const n = Number(x);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    throw new Error(`${field} must be an integer between 0 and 10000`);
  }
  return BigInt(n);
}

function asPenaltyWinner(x: unknown): PenaltyWinner | null {
  if (x == null || x === "") return null;
  if (x === "Home" || x === "Away") return x;
  throw new Error('penalty_winner must be "Home", "Away", or null');
}

async function getNativeFreeBalanceRaw(api: GearApi, ss58: string): Promise<bigint> {
  const info = await (api as any).query.system.account(ss58);
  return BigInt(info.data.free.toString());
}

function formatBalance(raw: bigint): string {
  const base = 10n ** BigInt(NATIVE_DECIMALS);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(NATIVE_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

async function sendTx(tx: any, signer: any, label: string): Promise<any> {
  if (!tx) throw new Error(`[${label}] invalid TransactionBuilder`);
  if (typeof tx.withAccount !== "function") throw new Error(`[${label}] no withAccount()`);
  tx.withAccount(signer);
  if (typeof tx.calculateGas === "function") {
    try {
      await tx.calculateGas();
    } catch (e) {
      console.warn(`[${label}] calculateGas failed, proceeding:`, (e as any)?.message);
    }
  }
  if (typeof tx.signAndSend !== "function") throw new Error(`[${label}] no signAndSend()`);
  return tx.signAndSend();
}

/* ============================================================
   EXPRESS
   ============================================================ */
const app = express();
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS: origin not allowed"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

/* ============================================================
   HEALTH
   ============================================================ */
app.get("/health", async (_req, res) => {
  try {
    const api = await getApi();
    const signer = getGatewaySigner();
    const prefix = ss58PrefixFromApi(api);
    const ss58 = prefix != null ? encodeAddress(decodeAddress(signer.address), prefix) : signer.address;
    const hex = toHexAddress(signer.address);
    const balRaw = await getNativeFreeBalanceRaw(api, ss58);

    return res.json({
      ok: true,
      time: new Date().toISOString(),
      rpc: VARA_WS,
      oracleProgram: ORACLE_PROGRAM_ID,
      sportsCompetition: SPORTS_COMPETITION_CODE,
      autoFeedIntervalMs: AUTO_FEED_INTERVAL_MS,
      signer: { ss58, hex, nativeBalance: formatBalance(balRaw) },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   ORACLE — QUERIES (read-only, no gas)
   ============================================================ */

/** GET /oracle/state — full oracle state snapshot */
app.get("/oracle/state", async (_req, res) => {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const state = await oracle.service.queryState();
    return res.json({ ok: true, state });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/** GET /oracle/results — all match results */
app.get("/oracle/results", async (_req, res) => {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const results = await oracle.service.queryAllResults();
    return res.json({ ok: true, results });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/** GET /oracle/result/:matchId — single finalized result */
app.get("/oracle/result/:matchId", async (req, res) => {
  try {
    const matchId = asMatchId(req.params.matchId, "matchId");
    const api = await getApi();
    const oracle = getOracle(api);
    const result = await oracle.service.queryMatchResult(matchId);
    return res.json({ ok: true, match_id: Number(matchId), result: result ?? null });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/** GET /oracle/pending — match IDs with no finalized result yet */
app.get("/oracle/pending", async (_req, res) => {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const pending = await oracle.service.queryPendingMatches();
    return res.json({ ok: true, pending });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   ORACLE — ADMIN MUTATIONS
   ============================================================ */

/**
 * POST /oracle/register-match
 * Body: { match_id: number, phase: string, home: string, away: string, kick_off: number }
 * Registers a match in Oracle-Program with the same metadata as BolaoCore.
 */
app.post("/oracle/register-match", async (req, res) => {
  try {
    const matchId  = asMatchId(req.body?.match_id, "match_id");
    const phase    = String(req.body?.phase    ?? "");
    const home     = String(req.body?.home     ?? "");
    const away     = String(req.body?.away     ?? "");
    const kickOff  = Number(req.body?.kick_off ?? 0);
    if (!phase)  throw new Error("phase is required");
    if (!home)   throw new Error("home is required");
    if (!away)   throw new Error("away is required");
    if (!kickOff) throw new Error("kick_off is required");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.registerMatch(matchId, phase, home, away, BigInt(kickOff));
    const result = await sendTx(tx, signer, "registerMatch");
    return res.json({ ok: true, match_id: Number(matchId), phase, home, away, kick_off: kickOff, result });
  } catch (e: any) {
    console.error("[/oracle/register-match]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/force-finalize
 * Body: { match_id: number, home: number, away: number, penalty_winner?: "Home"|"Away"|null }
 * Admin override: locks result bypassing consensus.
 */
app.post("/oracle/force-finalize", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const home = Number(req.body?.home);
    const away = Number(req.body?.away);
    if (!Number.isInteger(home) || home < 0 || home > 255) throw new Error("home must be 0–255");
    if (!Number.isInteger(away) || away < 0 || away > 255) throw new Error("away must be 0–255");
    const penaltyWinner = asPenaltyWinner(req.body?.penalty_winner ?? null);
    if (penaltyWinner !== null && home !== away) throw new Error("penalty_winner must be null when score is not a draw");

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.forceFinalizeResult(matchId, home, away, penaltyWinner);
    const result = await sendTx(tx, signer, "forceFinalizeResult");
    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/oracle/force-finalize]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/cancel-result
 * Body: { match_id: number }
 * Resets a pending match, clearing all submissions.
 */
app.post("/oracle/cancel-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.cancelResult(matchId);
    const result = await sendTx(tx, signer, "cancelResult");
    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/oracle/cancel-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/set-feeder
 * Body: { feeder: "SS58 or 0x...", authorized: boolean }
 */
app.post("/oracle/set-feeder", async (req, res) => {
  try {
    const feeder = asActorId(req.body?.feeder, "feeder");
    if (typeof req.body?.authorized !== "boolean") throw new Error("authorized must be boolean");
    const authorized: boolean = req.body.authorized;

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.setFeederAuthorized(feeder, authorized);
    const result = await sendTx(tx, signer, "setFeederAuthorized");
    return res.json({ ok: true, feeder, authorized, result });
  } catch (e: any) {
    console.error("[/oracle/set-feeder]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/set-threshold
 * Body: { threshold: number }  — 1 to 20
 */
app.post("/oracle/set-threshold", async (req, res) => {
  try {
    const threshold = Number(req.body?.threshold);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) {
      throw new Error("threshold must be an integer 1–20");
    }
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.setConsensusThreshold(threshold);
    const result = await sendTx(tx, signer, "setConsensusThreshold");
    return res.json({ ok: true, threshold, result });
  } catch (e: any) {
    console.error("[/oracle/set-threshold]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/set-bolao-program
 * Body: { program_id: "SS58 or 0x..." }
 */
app.post("/oracle/set-bolao-program", async (req, res) => {
  try {
    const programId = asActorId(req.body?.program_id, "program_id");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.setBolaoProgram(programId);
    const result = await sendTx(tx, signer, "setBolaoProgram");
    return res.json({ ok: true, program_id: programId, result });
  } catch (e: any) {
    console.error("[/oracle/set-bolao-program]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/propose-admin
 * Body: { new_admin: "SS58 or 0x..." }
 */
app.post("/oracle/propose-admin", async (req, res) => {
  try {
    const newAdmin = asActorId(req.body?.new_admin, "new_admin");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.proposeAdmin(newAdmin);
    const result = await sendTx(tx, signer, "proposeAdmin");
    return res.json({ ok: true, new_admin: newAdmin, result });
  } catch (e: any) {
    console.error("[/oracle/propose-admin]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/accept-admin
 * No body needed — the signer of GATEWAY_SEED accepts the admin role.
 */
app.post("/oracle/accept-admin", async (_req, res) => {
  try {
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.acceptAdmin();
    const result = await sendTx(tx, signer, "acceptAdmin");
    return res.json({ ok: true, result });
  } catch (e: any) {
    console.error("[/oracle/accept-admin]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/add-operator
 * Body: { operator: "SS58 or 0x..." }
 * Grants operator role in Oracle-Program (can register matches and force-finalize).
 * Admin-only — signed with GATEWAY_SEED.
 */
app.post("/oracle/add-operator", async (req, res) => {
  try {
    const operator = asActorId(req.body?.operator, "operator");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.addOperator(operator);
    const result = await sendTx(tx, signer, "oracle:addOperator");
    return res.json({ ok: true, operator, result });
  } catch (e: any) {
    console.error("[/oracle/add-operator]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/remove-operator
 * Body: { operator: "SS58 or 0x..." }
 * Revokes operator role in Oracle-Program.
 * Admin-only — signed with GATEWAY_SEED.
 */
app.post("/oracle/remove-operator", async (req, res) => {
  try {
    const operator = asActorId(req.body?.operator, "operator");
    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.removeOperator(operator);
    const result = await sendTx(tx, signer, "oracle:removeOperator");
    return res.json({ ok: true, operator, result });
  } catch (e: any) {
    console.error("[/oracle/remove-operator]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   ORACLE — FEEDER MUTATION
   ============================================================ */

/**
 * POST /oracle/submit-result
 * Body: { match_id: number, home: number, away: number, penalty_winner?: "Home"|"Away"|null }
 * Submits a result as the GATEWAY_SEED feeder account.
 */
app.post("/oracle/submit-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const home = Number(req.body?.home);
    const away = Number(req.body?.away);
    if (!Number.isInteger(home) || home < 0 || home > 255) throw new Error("home must be 0–255");
    if (!Number.isInteger(away) || away < 0 || away > 255) throw new Error("away must be 0–255");
    const penaltyWinner = asPenaltyWinner(req.body?.penalty_winner ?? null);
    if (penaltyWinner !== null && home !== away) throw new Error("penalty_winner must be null when score is not a draw");

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.submitResult(matchId, home, away, penaltyWinner);
    const result = await sendTx(tx, signer, "submitResult");
    return res.json({ ok: true, match_id: Number(matchId), home, away, penalty_winner: penaltyWinner, result });
  } catch (e: any) {
    console.error("[/oracle/submit-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   SPORTS API BRIDGE
   ============================================================ */

/**
 * GET /sports/match/:id
 * Fetches match data from football-data.org.
 * No side effects — read only.
 */
app.get("/sports/match/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("id must be a positive integer");
    const match = await fetchSportMatch(id);
    return res.json({ ok: true, match });
  } catch (e: any) {
    console.error("[/sports/match/:id]", e?.message);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /sports/finished
 * Lists finished matches for the configured competition (default: WC).
 */
app.get("/sports/finished", async (_req, res) => {
  try {
    const matches = await fetchFinishedMatchesForCompetition();
    return res.json({ ok: true, competition: SPORTS_COMPETITION_CODE, count: matches.length, matches });
  } catch (e: any) {
    console.error("[/sports/finished]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /sports/matches
 * Transparent proxy to football-data.org /v4/matches.
 * All query params are forwarded as-is (dateFrom, dateTo, competitions, status, etc.)
 * Example: /sports/matches?dateFrom=2026-04-16&dateTo=2026-04-30
 */
app.get("/sports/matches", async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${SPORTS_BASE_URL}/matches${qs ? `?${qs}` : ""}`;
    const apiRes = await fetch(url, { headers: buildSportsHeaders() });
    const body = await apiRes.json();
    if (!apiRes.ok) return res.status(apiRes.status).json({ ok: false, ...body });
    return res.json({ ok: true, ...body });
  } catch (e: any) {
    console.error("[/sports/matches]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /oracle/feed-match/:matchId
 * Fetches the match from football-data.org and submits it to Oracle-Program.
 * The match must already be registered in Oracle-Program (POST /oracle/register-match).
 */
app.post("/oracle/feed-match/:matchId", async (req, res) => {
  try {
    const matchId = asMatchId(req.params.matchId, "matchId");
    // Resolve oracle match_id to the sports-API ID (mapping may differ after sync-tournament)
    const sportsId = matchIdToSportsId.get(Number(matchId)) ?? Number(matchId);
    const sportMatch = await fetchSportMatch(sportsId);
    const mapped = mapMatchToOracle(sportMatch);

    if (!mapped) {
      return res.status(422).json({
        ok: false,
        error: `Match ${matchId} is not FINISHED or scores are missing (status: ${sportMatch.status})`,
      });
    }

    const api = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);
    const tx = oracle.service.submitResult(matchId, mapped.home, mapped.away, mapped.penalty_winner);
    const result = await sendTx(tx, signer, "feedMatch");

    return res.json({
      ok: true,
      match_id: Number(matchId),
      home: mapped.home,
      away: mapped.away,
      penalty_winner: mapped.penalty_winner,
      result,
    });
  } catch (e: any) {
    console.error("[/oracle/feed-match]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   WORLD CUP — football-data.org enriched endpoints
   All routes use competition code "WC" directly (not the
   configurable SPORTS_COMPETITION_CODE) because these endpoints
   expose WC-specific data shapes (group tables, team crests, etc.)
   ============================================================ */

/**
 * GET /wc/fixtures
 * All WC fixtures with team names, scores, matchday, and stage.
 * Optional query param: ?status=FINISHED|SCHEDULED|IN_PLAY|TIMED
 */
app.get("/wc/fixtures", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const matches = await fetchWCFixtures(status);
    return res.json({ ok: true, count: matches.length, matches });
  } catch (e: any) {
    console.error("[/wc/fixtures]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /wc/standings
 * Current group-stage standings tables (all groups).
 */
app.get("/wc/standings", async (_req, res) => {
  try {
    const standings = await fetchWCStandings();
    return res.json({ ok: true, count: standings.length, standings });
  } catch (e: any) {
    console.error("[/wc/standings]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /wc/friendlies
 * Upcoming friendly matches within a 14-day rolling window.
 * Filters by FRIENDLIES_COMPETITION_CODES env var if set (comma-separated codes).
 * Each match includes a `competition` field from football-data.org.
 */
app.get("/wc/friendlies", async (_req, res) => {
  try {
    const matches = await fetchFriendliesInWindow(14);
    return res.json({ ok: true, count: matches.length, matches });
  } catch (e: any) {
    console.error("[/wc/friendlies]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /wc/upcoming-15d
 * Matches across all competitions within a 15-day rolling window.
 * Filters by FRIENDLIES_COMPETITION_CODES env var if set (comma-separated codes).
 */
app.get("/wc/upcoming-15d", async (_req, res) => {
  try {
    const matches = await fetchFriendliesInWindow(15);
    return res.json({ ok: true, count: matches.length, matches });
  } catch (e: any) {
    console.error("[/wc/upcoming-15d]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /sports/competition/:code/matches
 * Matches for a specific competition in a 15-day rolling window from today.
 * Uses football-data.org /v4/competitions/{code}/matches endpoint.
 * Example: /sports/competition/SA/matches  (Serie A)
 *          /sports/competition/PD/matches  (La Liga)
 *          /sports/competition/PPL/matches (Liga Portugal)
 *          /sports/competition/BL1/matches (Bundesliga)
 *          /sports/competition/FL1/matches (Ligue 1)
 */
app.get("/sports/competition/:code/matches", async (req, res) => {
  try {
    const code = (req.params.code ?? "").toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: "Missing competition code" });

    const now = new Date();
    const dateFrom = now.toISOString().split("T")[0];
    const dateTo = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const cacheKey = `competition:${code}:${dateFrom}`;
    const cached = getCached<WCFixture[]>(cacheKey);
    if (cached) return res.json({ ok: true, count: cached.length, matches: cached });

    const url = `${SPORTS_BASE_URL}/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const apiRes = await fetch(url, { headers: buildSportsHeaders() });
    const body = await apiRes.json() as { matches?: WCFixture[]; error?: string; message?: string };
    if (!apiRes.ok) return res.status(apiRes.status).json({ ok: false, error: body.message ?? body.error });

    const matches = body.matches ?? [];
    setCached(cacheKey, matches, FIXTURES_TTL_MS);
    populateCrests(matches);
    return res.json({ ok: true, count: matches.length, matches });
  } catch (e: any) {
    console.error("[/sports/competition/:code/matches]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /sports/crests
 * Returns { [teamName]: crestUrl } aggregated from all cached fixture data.
 * Used by the frontend to display team crests without needing a sports API key.
 */
app.get("/sports/crests", async (_req, res) => {
  // If accumulator is sparse, actively fetch to warm it up
  if (Object.keys(crestsAccumulator).length < 5) {
    await Promise.allSettled([
      fetchWCFixtures(undefined).then(populateCrests),
      fetchWCTeams().then((teams) => {
        for (const t of teams) {
          if (t.name && t.crest) crestsAccumulator[t.name] = t.crest;
          if (t.shortName && t.crest) crestsAccumulator[t.shortName] = t.crest;
        }
      }),
    ]);
  }
  return res.json({ ok: true, count: Object.keys(crestsAccumulator).length, crests: { ...crestsAccumulator } });
});

/**
 * GET /sports/match-crests
 * Uses matchIdToSportsId mapping to fetch full fixture data for each BolaoCore match.
 * Returns { [bolaoMatchId]: { home: { name, crest }, away: { name, crest } } }
 * Populated into crestsAccumulator as a side-effect.
 */
app.get("/sports/match-crests", async (_req, res) => {
  if (matchIdToSportsId.size === 0) {
    return res.json({ ok: true, count: 0, matches: {} });
  }

  type TeamInfo = { name: string; shortName: string; crest: string };
  const result: Record<string, { home: TeamInfo; away: TeamInfo }> = {};

  try {
    // Single bulk request instead of one per match. football-data.org free tier is
    // 10 req/min, so fanning out one /matches/{id} call per registered match (70+)
    // instantly gets the server rate-limited. The bulk /competitions/WC/matches
    // response already carries each fixture's id + homeTeam/awayTeam crests, so we
    // resolve every mapping entry from a single (cached) request via in-memory lookup.
    const fixtures = await fetchWCFixtures();
    const byId = new Map(fixtures.map((f) => [f.id, f]));

    for (const [bolaoId, sportsId] of matchIdToSportsId.entries()) {
      const fixture = byId.get(sportsId);
      if (fixture?.homeTeam && fixture?.awayTeam) {
        result[String(bolaoId)] = {
          home: { name: fixture.homeTeam.name ?? '', shortName: fixture.homeTeam.shortName ?? '', crest: fixture.homeTeam.crest ?? '' },
          away: { name: fixture.awayTeam.name ?? '', shortName: fixture.awayTeam.shortName ?? '', crest: fixture.awayTeam.crest ?? '' },
        };
      }
    }
  } catch (e: any) {
    console.warn(`[match-crests] bulk fixtures fetch failed:`, e?.message);
  }

  return res.json({ ok: true, count: Object.keys(result).length, matches: result });
});

/**
 * GET /wc/teams
 * All teams participating in the World Cup with metadata.
 */
app.get("/wc/teams", async (_req, res) => {
  try {
    const teams = await fetchWCTeams();
    return res.json({ ok: true, count: teams.length, teams });
  } catch (e: any) {
    console.error("[/wc/teams]", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /wc/sync
 * Fetches all finished WC matches from football-data.org and submits
 * each result to Oracle-Program (skipps matches that are not registered).
 *
 * Body (optional): { dry_run: true }
 *   dry_run=true returns what would be submitted without sending transactions.
 */
app.post("/wc/sync", async (req, res) => {
  const dryRun = req.body?.dry_run === true;

  try {
    const matches = await fetchWCFixtures("FINISHED");

    type SyncEntry = {
      id: number;
      home_team: string;
      away_team: string;
      home: number;
      away: number;
      penalty_winner: PenaltyWinner | null;
    };

    const eligible: SyncEntry[] = [];
    for (const m of matches) {
      const mapped = resolveOnFieldResult(m.score, String(m.id));
      if (!mapped) continue;
      eligible.push({
        id: m.id,
        home_team: m.homeTeam.name,
        away_team: m.awayTeam.name,
        home: mapped.home,
        away: mapped.away,
        penalty_winner: mapped.penalty_winner,
      });
    }

    if (dryRun) {
      return res.json({ ok: true, dry_run: true, total_finished: matches.length, would_submit: eligible });
    }

    const api = await getApi();
    const oracle = getOracle(api);
    const signer = getGatewaySigner();

    const results: Array<{ id: number; home_team: string; away_team: string; status: string; error?: string }> = [];

    for (const entry of eligible) {
      // Resolve sports-API ID to the sequential oracle match_id used on-chain.
      // If no mapping exists the sports-API ID is used directly (legacy behaviour).
      const oracleMatchId = sportsIdToMatchId.has(entry.id)
        ? BigInt(sportsIdToMatchId.get(entry.id)!)
        : BigInt(entry.id);
      try {
        const tx = oracle.service.submitResult(oracleMatchId, entry.home, entry.away, entry.penalty_winner);
        await sendTx(tx, signer, `wc-sync:${entry.id}`);
        results.push({ id: entry.id, home_team: entry.home_team, away_team: entry.away_team, status: "submitted" });
        console.log(`[wc/sync] ✓ match ${entry.id} (oracle_id=${oracleMatchId}) ${entry.home_team} ${entry.home}–${entry.away} ${entry.away_team}`);
      } catch (e: any) {
        console.warn(`[wc/sync] match ${entry.id} failed:`, e?.message);
        results.push({ id: entry.id, home_team: entry.home_team, away_team: entry.away_team, status: "failed", error: e?.message });
      }
    }

    const submitted = results.filter((r) => r.status === "submitted").length;
    const failed = results.filter((r) => r.status === "failed").length;
    return res.json({ ok: true, total_finished: matches.length, submitted, failed, results });
  } catch (e: any) {
    console.error("[/wc/sync]", e?.stack ?? e);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   TEST ENDPOINT
   ============================================================ */

/**
 * POST /test/submit-result
 * Submits a hardcoded result (match_id=1, home=2, away=1) to Oracle-Program.
 * Use this to test the full flow: Oracle → ConsensusReached → BolaoCore pull.
 */
app.post("/test/submit-result", async (_req, res) => {
  const MATCH_ID = 1n;
  const HOME    = 2;
  const AWAY    = 1;
  const PENALTY = null;

  try {
    const api    = await getApi();
    const signer = getGatewaySigner();
    const oracle = getOracle(api);

    const tx = oracle.service.submitResult(MATCH_ID, HOME, AWAY, PENALTY);
    const result = await sendTx(tx, signer, "test:submitResult");

    console.log(`[test] submitted match ${MATCH_ID}: ${HOME}–${AWAY}`);
    return res.json({ ok: true, match_id: 1, home: HOME, away: AWAY, penalty_winner: PENALTY, result });
  } catch (e: any) {
    console.error("[/test/submit-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   BOLAO BRIDGE — pull from Oracle-Program
   ============================================================ */

/**
 * POST /bolao/register-phase
 * Body: { name: string, start_time: number (ms), end_time: number (ms), points_weight: number }
 * Registers a new tournament phase in BolaoCore. Admin-only on-chain.
 */
app.post("/bolao/register-phase", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const startTime = Number(req.body?.start_time);
    const endTime = Number(req.body?.end_time);
    const pointsWeight = Number(req.body?.points_weight ?? 1);

    if (!name) throw new Error("name is required");
    if (!Number.isFinite(startTime) || startTime <= 0) throw new Error("start_time must be a positive timestamp in ms");
    if (!Number.isFinite(endTime) || endTime <= 0) throw new Error("end_time must be a positive timestamp in ms");
    if (endTime <= startTime) throw new Error("end_time must be greater than start_time");
    if (!Number.isInteger(pointsWeight) || pointsWeight <= 0) throw new Error("points_weight must be a positive integer");

    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);

    const tx = bolao.service.registerPhase(name, BigInt(startTime), BigInt(endTime), pointsWeight);
    const result = await sendTx(tx, signer, "registerPhase");

    return res.json({ ok: true, name, start_time: startTime, end_time: endTime, points_weight: pointsWeight, result });
  } catch (e: any) {
    console.error("[/bolao/register-phase]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/register-match
 * Body: { home_team: string, away_team: string, kick_off: number (ms), phase: string }
 * Registers a new match in BolaoCore so users can place bets.
 * The contract auto-assigns the match_id (auto-incremented) — do not pass match_id here.
 */
app.post("/bolao/register-match", async (req, res) => {
  try {
    const homeTeam = String(req.body?.home_team ?? "").trim();
    const awayTeam = String(req.body?.away_team ?? "").trim();
    const kickOff = Number(req.body?.kick_off);
    const phase = String(req.body?.phase ?? "").trim();

    if (!homeTeam) throw new Error("home_team is required");
    if (!awayTeam) throw new Error("away_team is required");
    if (!Number.isFinite(kickOff) || kickOff <= 0) throw new Error("kick_off must be a positive timestamp in ms");
    if (!phase) throw new Error("phase is required");

    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);

    const tx = bolao.service.registerMatch(phase, homeTeam, awayTeam, BigInt(kickOff));
    const result = await sendTx(tx, signer, "registerMatch");

    return res.json({ ok: true, home_team: homeTeam, away_team: awayTeam, kick_off: kickOff, phase, result });
  } catch (e: any) {
    console.error("[/bolao/register-match]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/cancel-proposed-result
 * Body: { match_id: number }
 * Admin-only — cancels a Proposed result so it can be re-proposed with correct data.
 */
app.post("/bolao/cancel-proposed-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");

    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);

    const tx = bolao.service.cancelProposedResult(matchId);
    const result = await sendTx(tx, signer, "cancelProposedResult");

    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/bolao/cancel-proposed-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/finalize-result
 * Body: { match_id: number }
 * Permissionless — executes after the 2-min challenge window expires.
 */
app.post("/bolao/finalize-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");

    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);

    const tx = bolao.service.finalizeResult(matchId);
    const result = await sendTx(tx, signer, "finalizeResult");

    return res.json({ ok: true, match_id: Number(matchId), result });
  } catch (e: any) {
    console.error("[/bolao/finalize-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/propose-from-oracle
 * Body: { match_id: number }
 *
 * Triggers BolaoCore to query Oracle-Program directly and set the match
 * result to Proposed.  BolaoCore verifies the result on-chain — this
 * endpoint only provides the match_id trigger, no result data.
 * Admin must still call finalize_result() to distribute points.
 */
app.post("/bolao/propose-from-oracle", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");

    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);

    const tx = bolao.service.proposeFromOracle(matchId, ORACLE_PROGRAM_ID);
    const result = await sendTx(tx, signer, "proposeFromOracle");

    return res.json({
      ok: true,
      match_id: Number(matchId),
      oracle_program_id: ORACLE_PROGRAM_ID,
      result,
    });
  } catch (e: any) {
    console.error("[/bolao/propose-from-oracle]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/add-admin
 * Body: { new_admin: "SS58 or 0x..." }
 * Adds a new admin to BolaoCore. Signed with GATEWAY_SEED (must be an existing admin).
 */
app.post("/bolao/add-admin", async (req, res) => {
  try {
    const newAdmin = asActorId(req.body?.new_admin, "new_admin");
    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);
    const tx = bolao.service.addAdmin(newAdmin);
    const result = await sendTx(tx, signer, "addAdmin");
    return res.json({ ok: true, new_admin: newAdmin, result });
  } catch (e: any) {
    console.error("[/bolao/add-admin]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/remove-admin
 * Body: { admin: "SS58 or 0x..." }
 * Removes an admin from BolaoCore. Cannot remove the last admin.
 * Signed with GATEWAY_SEED (must be an existing admin).
 */
app.post("/bolao/remove-admin", async (req, res) => {
  try {
    const admin = asActorId(req.body?.admin, "admin");
    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);
    const tx = bolao.service.removeAdmin(admin);
    const result = await sendTx(tx, signer, "removeAdmin");
    return res.json({ ok: true, admin, result });
  } catch (e: any) {
    console.error("[/bolao/remove-admin]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/add-operator
 * Body: { operator: "SS58 or 0x..." }
 * Grants operator role in BolaoCore (can register phases and matches).
 * Admin-only — signed with GATEWAY_SEED.
 */
app.post("/bolao/add-operator", async (req, res) => {
  try {
    const operator = asActorId(req.body?.operator, "operator");
    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);
    const tx = bolao.service.addOperator(operator);
    const result = await sendTx(tx, signer, "bolao:addOperator");
    return res.json({ ok: true, operator, result });
  } catch (e: any) {
    console.error("[/bolao/add-operator]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/remove-operator
 * Body: { operator: "SS58 or 0x..." }
 * Revokes operator role in BolaoCore.
 * Admin-only — signed with GATEWAY_SEED.
 */
app.post("/bolao/remove-operator", async (req, res) => {
  try {
    const operator = asActorId(req.body?.operator, "operator");
    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);
    const tx = bolao.service.removeOperator(operator);
    const result = await sendTx(tx, signer, "bolao:removeOperator");
    return res.json({ ok: true, operator, result });
  } catch (e: any) {
    console.error("[/bolao/remove-operator]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/set-treasury
 * Body: { treasury: "SS58 or 0x..." }
 * Updates the treasury address in BolaoCore. All protocol fees and dust are sent here.
 * Admin-only — signed with GATEWAY_SEED.
 */
app.post("/bolao/set-treasury", async (req, res) => {
  try {
    const treasury = asActorId(req.body?.treasury, "treasury");
    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);
    const tx = bolao.service.setTreasury(treasury);
    const result = await sendTx(tx, signer, "setTreasury");
    return res.json({ ok: true, treasury, result });
  } catch (e: any) {
    console.error("[/bolao/set-treasury]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/sweep-all-match-dust
 * No body required.
 * Operator-only — iterates all matches and calls sweep_match_dust_to_final_prize
 * for every match that is settlement_prepared and not yet dust_swept.
 * Skips matches that are not eligible (not finalized, already swept, no bets).
 * Calls are sent sequentially with a 3s stagger to avoid nonce collisions.
 */
app.post("/bolao/sweep-all-match-dust", async (req, res) => {
  try {
    const api = await getApi();
    const signer = getOperatorSigner();
    const bolao = getBolao(api);

    const state = await bolao.service.queryState();
    const eligible = state.matches.filter(
      (m) => m.settlement_prepared && !m.dust_swept,
    );

    if (eligible.length === 0) {
      return res.json({ ok: true, swept: [], skipped: 0, message: "No eligible matches" });
    }

    const swept: number[] = [];
    const errors: { match_id: number; error: string }[] = [];

    for (const m of eligible) {
      try {
        const tx = bolao.service.sweepMatchDustToFinalPrize(m.match_id);
        await sendTx(tx, signer, `sweepMatchDustToFinalPrize(${m.match_id})`);
        swept.push(m.match_id);
        console.log(`[sweep-all-match-dust] swept match_id=${m.match_id}`);
      } catch (e: any) {
        errors.push({ match_id: m.match_id, error: e?.message ?? String(e) });
        console.warn(`[sweep-all-match-dust] match_id=${m.match_id} failed:`, e?.message);
      }
      if (eligible.indexOf(m) < eligible.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    return res.json({ ok: true, swept, errors, total_eligible: eligible.length });
  } catch (e: any) {
    console.error("[/bolao/sweep-all-match-dust]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   BOLAO — PENDING FINALIZATION (composite read + classification)
   ============================================================ */

/**
 * Shape returned per pending match.
 * case_label uses internal codes that map 1-to-1 to spec requirements.
 * Spec labels: NOT_IN_ORACLE → CASE_1, ORACLE_PENDING_CORRECTABLE → CASE_3A,
 * ORACLE_FINALIZED_AMBIGUOUS → CASE_2_OR_3B, PROPOSED_AWAITING_FINALIZE → PROPOSED.
 */
interface PendingMatchEntry {
  match_id: number;
  home: string;
  away: string;
  phase: string;
  kick_off: number;
  bolao_status: 'Unresolved' | 'Proposed';
  bolao_proposed_score: { home: number; away: number } | null;
  bolao_proposed_deadline: number | null; // ms epoch: proposed_at + CHALLENGE_WINDOW_MS
  oracle_status: 'Pending' | 'Finalized' | null;
  oracle_score: { home: number; away: number } | null;
  oracle_penalty_winner: string | null;
  oracle_submissions: number;
  case_label: CaseLabel;
  available_actions: string[];
  null_join: boolean;
  /** True when the match phase has points_weight > 1 (knockout rule from BolaoCore). */
  is_knockout: boolean;
}

/**
 * Build the derived shape for a single pending match.
 *
 * @param bolaoMatch  - Match object from BolaoCore queryState
 * @param oracleEntry - Oracle entry for this match_id (null when no Oracle entry exists)
 * @param phaseMap    - Map<phaseName, pointsWeight> built from IoSmartCupState.phases;
 *                      used to determine knockout status (points_weight > 1 = knockout)
 */
function derivePendingMatch(
  bolaoMatch: any,
  oracleEntry: any | null,
  phaseMap: Map<string, number> = new Map(),
): PendingMatchEntry {
  const bolaoStatus: 'Unresolved' | 'Proposed' =
    bolaoMatch.result === 'Unresolved'
      ? 'Unresolved'
      : typeof bolaoMatch.result === 'object' && bolaoMatch.result !== null && 'proposed' in bolaoMatch.result
      ? 'Proposed'
      : 'Unresolved';

  const proposedData = bolaoStatus === 'Proposed' ? bolaoMatch.result?.proposed : null;
  const bolaoProposedScore = proposedData
    ? { home: proposedData.score.home, away: proposedData.score.away }
    : null;
  const bolaoProposedDeadline = proposedData
    ? Number(proposedData.proposed_at) + CHALLENGE_WINDOW_MS
    : null;

  const oracleStatus: 'Pending' | 'Finalized' | null =
    oracleEntry?.status ?? null;
  const oracleScore = oracleEntry?.final_result?.score
    ? { home: oracleEntry.final_result.score.home, away: oracleEntry.final_result.score.away }
    : null;
  const oraclePenaltyWinner = oracleEntry?.final_result?.penalty_winner ?? null;
  const oracleSubmissions = Number(oracleEntry?.submissions ?? 0);

  const caseLabel = classifyMatch(bolaoStatus, oracleStatus, oracleSubmissions);

  const phaseName = String(bolaoMatch.phase);
  const pointsWeight = phaseMap.get(phaseName) ?? 1; // default 1 = group stage when unknown
  const isKnockout = pointsWeight > 1;

  return {
    match_id: Number(bolaoMatch.match_id),
    home: String(bolaoMatch.home),
    away: String(bolaoMatch.away),
    phase: phaseName,
    kick_off: Number(bolaoMatch.kick_off),
    bolao_status: bolaoStatus,
    bolao_proposed_score: bolaoProposedScore,
    bolao_proposed_deadline: bolaoProposedDeadline,
    oracle_status: oracleStatus,
    oracle_score: oracleScore,
    oracle_penalty_winner: oraclePenaltyWinner,
    oracle_submissions: oracleSubmissions,
    case_label: caseLabel,
    available_actions: availableActionsFor(caseLabel),
    null_join: oracleEntry === null || oracleEntry === undefined,
    is_knockout: isKnockout,
  };
}

/**
 * GET /bolao/pending-finalization
 *
 * Composite read: joins BolaoCore + Oracle state, filters to played-but-not-finalized
 * matches (kick_off < now AND bolao result !== Finalized), classifies each by case,
 * and returns the enriched list.
 *
 * Returns: { ok: true, generated_at: ISO, matches: PendingMatchEntry[] }
 * On query error: 500 { ok: false, error, source: 'bolao'|'oracle' }
 */
app.get("/bolao/pending-finalization", async (_req, res) => {
  try {
    const api = await getApi();
    const bolao = getBolao(api);
    const oracle = getOracle(api);

    let bolaoState: any;
    let oracleResults: any[];

    // Run both reads in parallel; track which source fails so error response is actionable.
    const bolaoReadPromise = bolao.service.queryState().catch((e: any) => {
      throw Object.assign(new Error(`Query failed: ${e?.message}`), { source: 'bolao' });
    });
    const oracleReadPromise = oracle.service.queryAllResults().catch((e: any) => {
      throw Object.assign(new Error(`Query failed: ${e?.message}`), { source: 'oracle' });
    });
    [bolaoState, oracleResults] = await Promise.all([bolaoReadPromise, oracleReadPromise]);

    const now = Date.now();

    // Build oracle lookup map
    const oracleMap = new Map<number, any>();
    for (const entry of oracleResults) {
      oracleMap.set(Number(entry.match_id), entry);
    }

    // Build phase points_weight map for knockout detection (points_weight > 1 = knockout).
    const phaseMap = new Map<string, number>();
    const phasesRaw: any[] = bolaoState.phases ?? [];
    for (const p of phasesRaw) {
      phaseMap.set(String(p.name), Number(p.points_weight ?? 1));
    }

    // Filter: played (kick_off < now) AND not finalized in BolaoCore
    const pending = bolaoState.matches.filter((m: any) => {
      const kickOff = Number(m.kick_off);
      if (kickOff >= now) return false; // future match
      // Exclude finalized
      if (typeof m.result === 'object' && m.result !== null && 'finalized' in m.result) return false;
      return true;
    });

    const matches: PendingMatchEntry[] = pending.map((m: any) => {
      const oracleEntry = oracleMap.get(Number(m.match_id)) ?? null;
      return derivePendingMatch(m, oracleEntry, phaseMap);
    });

    return res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      matches,
    });
  } catch (e: any) {
    console.error("[/bolao/pending-finalization]", e?.stack ?? e);
    const source: string | undefined = (e as any)?.source;
    return res.status(500).json({ ok: false, error: e?.message, ...(source ? { source } : {}) });
  }
});

/**
 * GET /bolao/match-status/:matchId
 *
 * Anti-false-positive re-read: directly queries BolaoCore + Oracle state
 * for a single match and returns the authoritative current on-chain state.
 * Use this endpoint AFTER every write action to confirm the write landed.
 *
 * Returns: { ok: true, match_id, status: PendingMatchEntry, raw_bolao_result }
 * Returns: 400 { ok: false, error } if matchId not found in BolaoCore.
 */
app.get("/bolao/match-status/:matchId", async (req, res) => {
  try {
    const matchId = asMatchId(req.params.matchId, "matchId");
    const matchIdNum = Number(matchId);

    const api = await getApi();
    const bolao = getBolao(api);
    const oracle = getOracle(api);

    const [bolaoState, oracleResults] = await Promise.all([
      bolao.service.queryState(),
      oracle.service.queryAllResults(),
    ]);

    const bolaoMatch = bolaoState.matches.find((m: any) => Number(m.match_id) === matchIdNum);
    if (!bolaoMatch) {
      return res.status(400).json({ ok: false, error: `match_id ${matchIdNum} not found in BolaoCore` });
    }

    const oracleEntry = oracleResults.find((r: any) => Number(r.match_id) === matchIdNum) ?? null;

    // Build phase map so is_knockout is accurate on per-match re-reads too.
    const phaseMap = new Map<string, number>();
    const phasesRaw: any[] = bolaoState.phases ?? [];
    for (const p of phasesRaw) {
      phaseMap.set(String(p.name), Number(p.points_weight ?? 1));
    }

    const status = derivePendingMatch(bolaoMatch, oracleEntry, phaseMap);

    return res.json({
      ok: true,
      match_id: matchIdNum,
      status,
      raw_bolao_result: bolaoMatch.result,
    });
  } catch (e: any) {
    console.error("[/bolao/match-status]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /bolao/propose-result
 * Body: { match_id: number, home: number, away: number, penalty_winner?: "Home"|"Away"|null }
 *
 * Case 3b endpoint: proposes a result directly to BolaoCore, bypassing the immutable Oracle.
 * The gateway must be in BolaoCore.authorized_oracles (one-time manual setup).
 *
 * IMPORTANT: sendTx may return ok:true even when the on-chain write fails (e.g. gateway not
 * in authorized_oracles causes a panic that calculateGas swallows). TRUE success confirmation
 * requires a follow-up GET /bolao/match-status/:matchId (Validate re-read) — the frontend
 * enforces this after calling this endpoint.
 *
 * Validation mirrors /oracle/force-finalize: home/away 0–255, penalty_winner only when draw.
 */
app.post("/bolao/propose-result", async (req, res) => {
  try {
    const matchId = asMatchId(req.body?.match_id, "match_id");
    const matchIdNum = Number(matchId);
    const home = Number(req.body?.home);
    const away = Number(req.body?.away);
    if (!Number.isInteger(home) || home < 0 || home > 255) throw new Error("home must be 0–255");
    if (!Number.isInteger(away) || away < 0 || away > 255) throw new Error("away must be 0–255");
    const penaltyWinner = asPenaltyWinner(req.body?.penalty_winner ?? null);

    // penalty_winner is only valid when score is a draw
    if (penaltyWinner !== null && home !== away) {
      throw new Error("penalty_winner must be null when score is not a draw");
    }

    const api = await getApi();
    const signer = getGatewaySigner();
    const bolao = getBolao(api);

    // Phase-gating: penalty_winner is only valid in knockout-stage draws.
    // A group-stage draw must never carry a penalty_winner (BolaoCore panics on this).
    // Determine knockout by reading the match phase and the phase points_weight from state.
    if (penaltyWinner !== null) {
      const bolaoState = await bolao.service.queryState();
      const bolaoMatch = bolaoState.matches.find((m: any) => Number(m.match_id) === matchIdNum);
      if (!bolaoMatch) {
        throw new Error(`match_id ${matchIdNum} not found in BolaoCore`);
      }
      const phaseName = String(bolaoMatch.phase);
      const phaseConfig = (bolaoState.phases ?? []).find((p: any) => String(p.name) === phaseName);
      const pointsWeight = Number(phaseConfig?.points_weight ?? 1);
      const isKnockout = pointsWeight > 1;
      if (!isKnockout) {
        throw new Error(
          `penalty_winner is not allowed for group-stage matches (phase: "${phaseName}"). ` +
          `Only knockout-stage draws (points_weight > 1) may carry a penalty winner.`,
        );
      }
    }

    const tx = bolao.service.proposeResult(matchId, home, away, penaltyWinner);
    // Note: sendTx may return ok:true even when on-chain write fails (swallowed panic).
    // The frontend MUST call GET /bolao/match-status/:matchId after this to confirm landing.
    const result = await sendTx(tx, signer, "proposeResult");

    return res.json({
      ok: true,
      match_id: Number(matchId),
      score: { home, away },
      penalty_winner: penaltyWinner,
      result,
    });
  } catch (e: any) {
    console.error("[/bolao/propose-result]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   SETUP — operator-signed registration (BolaoCore + Oracle-Program)

   These endpoints use OPERATOR_SEED so the privileged GATEWAY_SEED
   (feeder / admin key) is not needed for routine tournament setup.

   Prerequisite: the operator account must be added to both contracts
   via /bolao/add-operator and /oracle/add-operator first.
   ============================================================ */

/**
 * POST /setup/register-phase
 * Body: { name: string, start_time: number (ms), end_time: number (ms), points_weight: number }
 * Registers a new tournament phase in BolaoCore using the OPERATOR_SEED account.
 * Equivalent to /bolao/register-phase but signed by the operator, not the admin.
 */
app.post("/setup/register-phase", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const startTime = Number(req.body?.start_time);
    const endTime = Number(req.body?.end_time);
    const pointsWeight = Number(req.body?.points_weight ?? 1);

    if (!name) throw new Error("name is required");
    if (!Number.isFinite(startTime) || startTime <= 0) throw new Error("start_time must be a positive timestamp in ms");
    if (!Number.isFinite(endTime) || endTime <= 0) throw new Error("end_time must be a positive timestamp in ms");
    if (endTime <= startTime) throw new Error("end_time must be greater than start_time");
    if (!Number.isInteger(pointsWeight) || pointsWeight <= 0) throw new Error("points_weight must be a positive integer");

    const api = await getApi();
    const signer = getOperatorSigner();
    const bolao = getBolao(api);

    const tx = bolao.service.registerPhase(name, BigInt(startTime), BigInt(endTime), pointsWeight);
    const result = await sendTx(tx, signer, "setup:registerPhase");

    return res.json({ ok: true, name, start_time: startTime, end_time: endTime, points_weight: pointsWeight, result });
  } catch (e: any) {
    console.error("[/setup/register-phase]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /setup/register-match
 * Body: {
 *   phase: string,
 *   home_team: string,
 *   away_team: string,
 *   kick_off: number (ms),
 *   oracle_match_id: number   ← football-data.org match ID, registered in Oracle-Program
 * }
 *
 * Atomically registers the match in BOTH contracts using the OPERATOR_SEED account:
 *   1. BolaoCore.registerMatch — auto-assigns an internal match_id
 *   2. Oracle.registerMatch(oracle_match_id) — registers the football-data.org ID
 *
 * The caller must track the BolaoCore match_id ↔ oracle_match_id mapping.
 * Use /bolao/propose-from-oracle with the BolaoCore match_id to trigger settlement;
 * BolaoCore will query Oracle using the oracle_match_id stored in the match entry.
 *
 * If Oracle registration fails after BolaoCore succeeds, call /oracle/register-match
 * manually with oracle_match_id to complete the setup.
 */
app.post("/setup/register-match", async (req, res) => {
  try {
    const phase = String(req.body?.phase ?? "").trim();
    const homeTeam = String(req.body?.home_team ?? "").trim();
    const awayTeam = String(req.body?.away_team ?? "").trim();
    const kickOff = Number(req.body?.kick_off);
    const oracleMatchIdRaw = req.body?.oracle_match_id;

    if (!phase) throw new Error("phase is required");
    if (!homeTeam) throw new Error("home_team is required");
    if (!awayTeam) throw new Error("away_team is required");
    if (!Number.isFinite(kickOff) || kickOff <= 0) throw new Error("kick_off must be a positive timestamp in ms");

    const oracleMatchId = asMatchId(oracleMatchIdRaw, "oracle_match_id");

    const api = await getApi();
    const signer = getOperatorSigner();
    const bolao = getBolao(api);
    const oracle = getOracle(api);

    // Step 1: register match in BolaoCore (operator-signed, auto-assigns internal match_id)
    const bolaoTx = bolao.service.registerMatch(phase, homeTeam, awayTeam, BigInt(kickOff));
    const bolaoResult = await sendTx(bolaoTx, signer, "setup:bolao:registerMatch");
    console.log(`[setup/register-match] BolaoCore registered: ${homeTeam} vs ${awayTeam}`);

    // Step 2: register the oracle_match_id in Oracle-Program with the same metadata
    const oracleTx = oracle.service.registerMatch(oracleMatchId, phase, homeTeam, awayTeam, BigInt(kickOff));
    const oracleResult = await sendTx(oracleTx, signer, `setup:oracle:registerMatch:${Number(oracleMatchId)}`);
    console.log(`[setup/register-match] Oracle registered oracle_match_id=${Number(oracleMatchId)}`);

    return res.json({
      ok: true,
      phase,
      home_team: homeTeam,
      away_team: awayTeam,
      kick_off: kickOff,
      oracle_match_id: Number(oracleMatchId),
      bolao_result: bolaoResult,
      oracle_result: oracleResult,
    });
  } catch (e: any) {
    console.error("[/setup/register-match]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * GET /setup/match-mapping
 * Returns the current sequential-bolaoMatchId ↔ sportsApiId mapping in memory.
 */
app.get("/setup/match-mapping", (_req, res) => {
  const entries: Array<{ bolao_match_id: number; sports_api_id: number }> = [];
  matchIdToSportsId.forEach((sportsId, bolaoId) => {
    entries.push({ bolao_match_id: bolaoId, sports_api_id: sportsId });
  });
  entries.sort((a, b) => a.bolao_match_id - b.bolao_match_id);
  return res.json({ ok: true, count: entries.length, mapping: entries });
});

/**
 * POST /setup/repair-mapping
 * Manually adds a bolao_match_id → sports_api_id entry.
 * Use this to resolve entries that could not be auto-matched by rebuildMappingFromChain
 * (e.g. team names registered in a different language, playoff placeholders).
 *
 * Body: { bolao_match_id: number, sports_api_id: number }
 */
app.post("/setup/repair-mapping", (req, res) => {
  try {
    const bolaoMatchId = Number(req.body?.bolao_match_id);
    const sportsApiId  = Number(req.body?.sports_api_id);

    if (!Number.isInteger(bolaoMatchId) || bolaoMatchId < 1)
      throw new Error("bolao_match_id must be a positive integer");
    if (!Number.isInteger(sportsApiId) || sportsApiId < 1)
      throw new Error("sports_api_id must be a positive integer");

    addMatchMapping(bolaoMatchId, sportsApiId);
    saveMatchMapping();

    console.log(`[repair-mapping] Added: ${bolaoMatchId} → ${sportsApiId}`);
    return res.json({ ok: true, bolao_match_id: bolaoMatchId, sports_api_id: sportsApiId });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /match/register-both
 * Registers a match in BOTH BolaoCore AND Oracle with the same sequential ID,
 * then persists the sports_api_id → sequential mapping for the auto-feeder.
 *
 * Body: {
 *   phase: string,
 *   home_team: string,
 *   away_team: string,
 *   kick_off: number (ms timestamp),
 *   sports_api_id: number,   // football-data.org match ID (used for auto-feed result fetch)
 *   next_bolao_id: number,   // next sequential ID BolaoCore will assign (check BolaoCore tab)
 * }
 *
 * ID contract:
 *   BolaoCore auto-assigns next_bolao_id (sequential internal counter)
 *   Oracle is registered with oracle_match_id = next_bolao_id  (same sequential ID!)
 *   Mapping stored: next_bolao_id → sports_api_id
 *
 * This ensures the full automated pipeline works:
 *   auto-feed  → oracle pending [next_bolao_id] → mapping → sports_api_id → football-data.org
 *   bridge     → ConsensusReached(next_bolao_id) → proposeFromOracle(next_bolao_id) → BolaoCore OK
 */
app.post("/match/register-both", async (req, res) => {
  try {
    const phase       = String(req.body?.phase      ?? "").trim();
    const homeTeam    = String(req.body?.home_team  ?? "").trim();
    const awayTeam    = String(req.body?.away_team  ?? "").trim();
    const kickOff     = Number(req.body?.kick_off);
    const sportsApiId = Number(req.body?.sports_api_id);
    const nextBolaoId = Number(req.body?.next_bolao_id);

    if (!phase)                                          throw new Error("phase is required");
    if (!homeTeam)                                       throw new Error("home_team is required");
    if (!awayTeam)                                       throw new Error("away_team is required");
    if (!Number.isFinite(kickOff) || kickOff <= 0)       throw new Error("kick_off must be a positive ms timestamp");
    if (!Number.isFinite(sportsApiId) || sportsApiId<=0) throw new Error("sports_api_id must be a positive integer");
    if (!Number.isInteger(nextBolaoId) || nextBolaoId<1) throw new Error("next_bolao_id must be >= 1");

    const api    = await getApi();
    const signer = getOperatorSigner();
    const bolao  = getBolao(api);
    const oracle = getOracle(api);

    // Step 1: BolaoCore — auto-assigns the sequential nextBolaoId internally
    const bolaoTx = bolao.service.registerMatch(phase, homeTeam, awayTeam, BigInt(kickOff));
    const bolaoResult = await sendTx(bolaoTx, signer, `register-both:bolao:${nextBolaoId}`);
    console.log(`[/match/register-both] BolaoCore match ${nextBolaoId}: ${homeTeam} vs ${awayTeam}`);

    // Step 2: Oracle — registered with the SAME sequential ID (NOT the sports API ID)
    const oracleTx = oracle.service.registerMatch(
      BigInt(nextBolaoId), phase, homeTeam, awayTeam, BigInt(kickOff),
    );
    const oracleResult = await sendTx(oracleTx, signer, `register-both:oracle:${nextBolaoId}`);
    console.log(`[/match/register-both] Oracle match ${nextBolaoId} → sportsApiId=${sportsApiId}`);

    // Step 3: Persist mapping so auto-feeder can resolve the sports API match
    addMatchMapping(nextBolaoId, sportsApiId);
    addKickOff(nextBolaoId, kickOff);
    saveMatchMapping();
    saveKickOffMap();
    console.log(`[/match/register-both] Mapping saved: ${nextBolaoId} → ${sportsApiId}`);

    return res.json({
      ok: true,
      bolao_match_id:  nextBolaoId,
      oracle_match_id: nextBolaoId,
      sports_api_id:   sportsApiId,
      phase,
      home_team:  homeTeam,
      away_team:  awayTeam,
      kick_off:   kickOff,
      bolao_result: bolaoResult,
      oracle_result: oracleResult,
    });
  } catch (e: any) {
    console.error("[/match/register-both]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/**
 * POST /setup/sync-tournament
 *
 * Fully automates WC 2026 tournament registration for ONE phase:
 *   1. Fetches all WC fixtures from football-data.org (cached 5 min)
 *   2. Filters by stage and/or status
 *   3. Sorts by kick-off time (ascending) for deterministic ID assignment
 *   4. Registers the phase in BolaoCore (operator-signed)
 *   5. For each match in order:
 *        a. Registers in BolaoCore → auto-assigned sequential ID
 *        b. Registers in Oracle-Program with the SAME sequential ID
 *        c. Records the bolaoMatchId ↔ sportsApiId mapping
 *   6. Persists the mapping to ./data/match-mapping.json
 *
 * Body:
 *   phase_name:      string   — phase name in BolaoCore (required)
 *   points_weight:   number   — phase points weight (default: 1)
 *   start_time:      number   — phase start timestamp in ms (required)
 *   end_time:        number   — phase end timestamp in ms (required)
 *   stage_filter?:   string   — filter by football-data.org stage, e.g. "GROUP_STAGE"
 *                              empty / omitted = no stage filter
 *   status_filter?:  string   — "SCHEDULED" (default, includes TIMED) | "ALL"
 *   bolao_next_id:   number   — expected next BolaoCore match_id (default: 1).
 *                              Must match BolaoCore's next_match_id counter exactly.
 *   dry_run?:        boolean  — preview without sending transactions
 *
 * Notes:
 *   - The operator account must already have been added to both contracts
 *     via /bolao/add-operator and /oracle/add-operator.
 *   - Run with dry_run:true first to verify the fixture list and ID range.
 *   - If the server restarts the mapping is reloaded from disk automatically.
 */
app.post("/setup/sync-tournament", async (req, res) => {
  try {
    // ── Input validation ─────────────────────────────────────────────────
    const phaseName    = String(req.body?.phase_name ?? "").trim();
    const pointsWeight = Number(req.body?.points_weight ?? 1);
    const startTime    = Number(req.body?.start_time);
    const endTime      = Number(req.body?.end_time);
    const stageFilter  = String(req.body?.stage_filter ?? "").trim().toUpperCase();
    const statusFilter = String(req.body?.status_filter ?? "SCHEDULED").trim().toUpperCase();
    const bolaoNextId  = Number(req.body?.bolao_next_id ?? 1);
    const dryRun       = req.body?.dry_run === true;

    if (!phaseName) throw new Error("phase_name is required");
    if (!Number.isFinite(startTime) || startTime <= 0) throw new Error("start_time is required (Unix ms)");
    if (!Number.isFinite(endTime)   || endTime   <= 0) throw new Error("end_time is required (Unix ms)");
    if (endTime <= startTime) throw new Error("end_time must be after start_time");
    if (!Number.isInteger(pointsWeight) || pointsWeight <= 0) throw new Error("points_weight must be a positive integer");
    if (!Number.isInteger(bolaoNextId)  || bolaoNextId  <  1) throw new Error("bolao_next_id must be >= 1");

    // ── Fetch and filter fixtures ────────────────────────────────────────
    const allFixtures = await fetchWCFixtures();

    const availableStages = [...new Set(allFixtures.map((m) => m.stage))].sort();

    // stage_filter is required for live runs to prevent accidentally registering
    // matches from other phases under the same phase name.
    if (!stageFilter && !dryRun) {
      return res.status(400).json({
        ok: false,
        error: "stage_filter is required. Without it, ALL fixtures from every stage would be registered under the same phase, mixing phases.",
        available_stages: availableStages,
        hint: "Set stage_filter to one of the available stages and run with dry_run:true first to preview.",
      });
    }

    const fixtures = allFixtures.filter((m) => {
      // Stage filter (case-insensitive exact match against football-data.org stage field)
      if (stageFilter && m.stage.toUpperCase() !== stageFilter) return false;
      // Status filter: "SCHEDULED" accepts both SCHEDULED and TIMED (upcoming)
      if (statusFilter !== "ALL") {
        const s = m.status.toUpperCase();
        if (statusFilter === "SCHEDULED") {
          if (s !== "SCHEDULED" && s !== "TIMED") return false;
        } else {
          if (s !== statusFilter) return false;
        }
      }
      return true;
    });

    // Sort by kick-off time — BolaoCore ID assignment order must be deterministic
    fixtures.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

    // Detect mixed stages in the result set (can happen if stage_filter was broad)
    const fixtureStages = [...new Set(fixtures.map((m) => m.stage))];
    const mixedStages = fixtureStages.length > 1;

    if (fixtures.length === 0) {
      return res.json({
        ok: true, dry_run: dryRun,
        message: "No fixtures matched the filter criteria. Check stage_filter / status_filter.",
        total_available: allFixtures.length,
        available_stages: availableStages,
        phase: null, matches_registered: 0, matches: [],
      });
    }

    // Build the work list with pre-assigned sequential IDs
    type MatchEntry = {
      bolao_match_id: number;
      sports_api_id:  number;
      stage:          string;
      home_team:      string;
      away_team:      string;
      kick_off:       number;
      kick_off_utc:   string;
    };

    const matchList: MatchEntry[] = fixtures.map((m, i) => ({
      bolao_match_id: bolaoNextId + i,
      sports_api_id:  m.id,
      stage:          m.stage,
      home_team:      m.homeTeam.name,
      away_team:      m.awayTeam.name,
      kick_off:       new Date(m.utcDate).getTime(),
      kick_off_utc:   m.utcDate,
    }));

    const idRange = `${bolaoNextId}–${bolaoNextId + matchList.length - 1}`;

    // ── Dry run: return preview without touching the chain ───────────────
    if (dryRun) {
      return res.json({
        ok: true, dry_run: true,
        phase: phaseName
          ? { name: phaseName, start_time: startTime, end_time: endTime, points_weight: pointsWeight }
          : null,
        stage_filter: stageFilter || null,
        available_stages: availableStages,
        matched_stages: fixtureStages,
        mixed_stages_warning: mixedStages
          ? `Multiple stages found: ${fixtureStages.join(", ")}. Use a more specific stage_filter.`
          : undefined,
        total_fixtures: matchList.length,
        bolao_id_range: idRange,
        matches: matchList,
      });
    }

    // ── Live run ─────────────────────────────────────────────────────────
    const api    = await getApi();
    const signer = getOperatorSigner();
    const bolao  = getBolao(api);
    const oracle = getOracle(api);

    // Step 1 — Register phase in BolaoCore
    const phaseTx = bolao.service.registerPhase(phaseName, BigInt(startTime), BigInt(endTime), pointsWeight);
    await sendTx(phaseTx, signer, `sync:registerPhase:${phaseName}`);
    console.log(`[sync-tournament] Phase "${phaseName}" registered in BolaoCore`);

    // Step 2 — Register each match
    type MatchResult = MatchEntry & { bolao_ok: boolean; oracle_ok: boolean; error?: string };
    const results: MatchResult[] = [];

    for (const entry of matchList) {
      let bolaoOk = false;
      let oracleOk = false;
      let errMsg: string | undefined;

      try {
        // 2a — BolaoCore: auto-assigns entry.bolao_match_id (relies on sequential counter)
        const bolaoTx = bolao.service.registerMatch(
          phaseName, entry.home_team, entry.away_team, BigInt(entry.kick_off),
        );
        await sendTx(bolaoTx, signer, `sync:bolao:match:${entry.bolao_match_id}`);
        bolaoOk = true;
        console.log(`[sync-tournament] BolaoCore match ${entry.bolao_match_id}: ${entry.home_team} vs ${entry.away_team}`);
      } catch (e: any) {
        errMsg = `BolaoCore: ${e?.message}`;
        console.error(`[sync-tournament] BolaoCore match ${entry.bolao_match_id} failed:`, e?.message);
      }

      if (bolaoOk) {
        try {
          // 2b — Oracle-Program: same sequential ID + same metadata as BolaoCore
          const oracleTx = oracle.service.registerMatch(
            BigInt(entry.bolao_match_id),
            phaseName,
            entry.home_team,
            entry.away_team,
            BigInt(entry.kick_off),
          );
          await sendTx(oracleTx, signer, `sync:oracle:match:${entry.bolao_match_id}`);
          oracleOk = true;
          console.log(`[sync-tournament] Oracle    match ${entry.bolao_match_id}: sportsApiId=${entry.sports_api_id}`);
        } catch (e: any) {
          errMsg = `Oracle: ${e?.message}`;
          console.error(`[sync-tournament] Oracle match ${entry.bolao_match_id} failed:`, e?.message);
        }
      }

      if (bolaoOk && oracleOk) {
        addMatchMapping(entry.bolao_match_id, entry.sports_api_id);
        addKickOff(entry.bolao_match_id, entry.kick_off);
      }

      results.push({ ...entry, bolao_ok: bolaoOk, oracle_ok: oracleOk, error: errMsg });
    }

    // Persist mappings to disk
    saveMatchMapping();
    saveKickOffMap();

    const registered = results.filter((r) => r.bolao_ok && r.oracle_ok).length;
    const failed     = results.filter((r) => !r.bolao_ok || !r.oracle_ok).length;

    console.log(`[sync-tournament] Done — ${registered} registered, ${failed} failed`);

    return res.json({
      ok: failed === 0,
      dry_run: false,
      phase: { name: phaseName, start_time: startTime, end_time: endTime, points_weight: pointsWeight },
      stage_filter: stageFilter,
      mixed_stages_warning: mixedStages
        ? `Multiple stages were registered under phase "${phaseName}": ${fixtureStages.join(", ")}`
        : undefined,
      total_fixtures: fixtures.length,
      registered,
      failed,
      bolao_id_range: idRange,
      results,
    });

  } catch (e: any) {
    console.error("[/setup/sync-tournament]", e?.stack ?? e);
    return res.status(400).json({ ok: false, error: e?.message });
  }
});

/* ============================================================
   AUTO-FEEDER (background scheduler)
   Polls pending oracle matches, fetches results from sports API,
   and submits them automatically.
   ============================================================ */
// Max API requests per auto-feed cycle — stays safely under the 10 req/min free-tier limit
const AUTO_FEED_BATCH_SIZE = intEnv("AUTO_FEED_BATCH_SIZE", 8);

async function runAutoFeed(): Promise<void> {
  try {
    const api = await getApi();
    const oracle = getOracle(api);
    const signer = getGatewaySigner();

    const pending = await oracle.service.queryPendingMatches();
    if (pending.length === 0) return;

    const now = Date.now();
    console.log(`[auto-feed] now=${now} (${new Date(now).toISOString()})`);
    console.log(`[auto-feed] kickOffMap entries: ${kickOffMap.size}`);
    kickOffMap.forEach((ko, id) => {
      console.log(`[auto-feed]   match ${id}: kick_off=${ko} (${new Date(ko).toISOString()}) started=${ko <= now}`);
    });

    // Sort: matches that have already started (kick_off <= now) first, then by kick_off asc.
    // Matches with no kick_off in the map are treated as future — sorted last and excluded.
    const sorted = [...pending].sort((a, b) => {
      const aKo = kickOffMap.get(Number(BigInt(a as any))) ?? Number.MAX_SAFE_INTEGER;
      const bKo = kickOffMap.get(Number(BigInt(b as any))) ?? Number.MAX_SAFE_INTEGER;
      const aStarted = aKo <= now;
      const bStarted = bKo <= now;
      if (aStarted && !bStarted) return -1;
      if (!aStarted && bStarted) return 1;
      return aKo - bKo;
    });

    // Only process matches with a known kick_off that has already passed.
    // Matches without kick_off data are skipped — they were registered before kickOffMap existed.
    const toProcess = sorted
      .filter((rawId) => {
        const ko = kickOffMap.get(Number(BigInt(rawId as any)));
        return ko !== undefined && ko <= now;
      })
      .slice(0, AUTO_FEED_BATCH_SIZE);

    const skipped = pending.length - sorted.filter((rawId) => {
      const ko = kickOffMap.get(Number(BigInt(rawId as any)));
      return ko !== undefined && ko <= now;
    }).length;

    console.log(`[auto-feed] ${pending.length} pending — ${toProcess.length} to process, ${skipped} skipped (not started)`);

    for (const rawId of toProcess) {
      const matchId = BigInt(rawId as any);
      const numId = Number(matchId);

      try {
        const sportsId = matchIdToSportsId.get(numId) ?? numId;
        const sportMatch = await fetchSportMatch(sportsId);
        const mapped = mapMatchToOracle(sportMatch);

        if (!mapped) {
          console.log(`[auto-feed] match ${numId} not finished yet (${sportMatch.status})`);
          continue;
        }

        console.log(`[auto-feed] submitting match ${numId}: ${mapped.home}–${mapped.away}${mapped.penalty_winner ? ` pen:${mapped.penalty_winner}` : ""}`);
        const tx = oracle.service.submitResult(matchId, mapped.home, mapped.away, mapped.penalty_winner);
        await sendTx(tx, signer, `auto-feed:${numId}`);
        console.log(`[auto-feed] ✓ match ${numId} submitted`);
      } catch (e: any) {
        console.warn(`[auto-feed] match ${numId} failed:`, e?.message);
      }
    }
  } catch (e: any) {
    console.error("[auto-feed] cycle error:", e?.message);
  }
}

/* ============================================================
   FINALIZE HELPERS
   ============================================================ */

function scheduleFinalize(
  bolao: ReturnType<typeof getBolao>,
  signer: ReturnType<typeof getGatewaySigner>,
  matchId: number,
  delayMs: number,
): void {
  console.log(`[auto-finalize] match ${matchId} — scheduled in ${delayMs / 1000}s`);
  setTimeout(async () => {
    console.log(`[auto-finalize] match ${matchId} — calling finalizeResult`);
    try {
      const tx = bolao.service.finalizeResult(BigInt(matchId));
      await sendTx(tx, signer, `auto-finalize:${matchId}`);
      console.log(`[auto-finalize] ✓ match ${matchId} finalized — points distributed`);
    } catch (e: any) {
      console.error(`[auto-finalize] match ${matchId} finalize failed:`, e?.message);
      console.warn(`[auto-finalize] retry manually: POST /bolao/finalize-result { match_id: ${matchId} }`);
    }
  }, Math.max(delayMs, 0));
}

async function recoverProposedMatches(
  bolao: ReturnType<typeof getBolao>,
  signer: ReturnType<typeof getGatewaySigner>,
): Promise<void> {
  console.log("[recover] scanning BolaoCore for stuck Proposed matches...");
  let state;
  try {
    state = await bolao.service.queryState();
  } catch (e: any) {
    console.error("[recover] queryState failed:", e?.message);
    return;
  }

  const now = Date.now();
  let recovered = 0;
  let scheduled = 0;

  // Separate expired from pending to serialize expired TXs (avoid nonce collisions)
  const expired: number[] = [];
  for (const match of state.matches) {
    if (typeof match.result !== 'object' || !('proposed' in match.result)) continue;
    const { proposed_at } = match.result.proposed;
    const expiresAt = Number(proposed_at) + CHALLENGE_WINDOW_MS;
    const remaining = expiresAt + FINALIZE_BUFFER_MS - now;

    if (remaining <= 0) {
      console.log(`[recover] match ${match.match_id} — challenge window expired, queued for finalization`);
      expired.push(Number(match.match_id));
      recovered++;
    } else {
      console.log(`[recover] match ${match.match_id} — re-scheduling finalize in ${Math.round(remaining / 1000)}s`);
      scheduleFinalize(bolao, signer, Number(match.match_id), remaining);
      scheduled++;
    }
  }

  // Process expired matches sequentially with a 3s gap to avoid nonce collisions
  for (let i = 0; i < expired.length; i++) {
    scheduleFinalize(bolao, signer, expired[i], i * 3_000);
  }

  if (recovered + scheduled === 0) {
    console.log("[recover] no stuck Proposed matches found");
  } else {
    console.log(`[recover] done — ${recovered} immediate, ${scheduled} re-scheduled`);
  }
}

/* ============================================================
   SERVER BOOT
   ============================================================ */
const server = app.listen(PORT, () => {
  console.log(`smartcup-oracle-server listening on :${PORT}`);
  console.log(`  Oracle Program : ${ORACLE_PROGRAM_ID}`);
  console.log(`  Vara RPC       : ${VARA_WS}`);
  console.log(`  Sports API     : football-data.org / competition=${SPORTS_COMPETITION_CODE}`);
  console.log(`  Auto-feed      : every ${AUTO_FEED_INTERVAL_MS / 1000}s`);

  // Load persistent match ID mapping (bolao sequential ID ↔ sports API ID)
  loadMatchMapping();
  loadKickOffMap();

  // Warm up GearApi connection and start ConsensusReached bridge
  getApi()
    .then((api) => {
      console.log("[boot] GearApi ready — starting ConsensusReached bridge");

      if (!BOLAO_PROGRAM_ID) {
        console.warn("[boot] BOLAO_PROGRAM_ID not set — bridge disabled");
        return;
      }

      const oracle = getOracle(api);
      const bolao = getBolao(api);
      const signer = getGatewaySigner();

      // Rebuild match mapping from on-chain data if the JSON files were lost
      // (happens on every Render redeploy due to ephemeral filesystem).
      if (matchIdToSportsId.size === 0) {
        rebuildMappingFromChain(oracle).catch((e) =>
          console.error("[mapping-rebuild] unhandled error:", e?.message),
        );
      }

      // Recover any matches stuck in Proposed state from a previous server run
      recoverProposedMatches(bolao, signer).catch((e) =>
        console.error("[recover] unhandled error:", e?.message),
      );

      // Listen for Oracle ConsensusReached events and forward to BolaoCore
      oracle.service.subscribeToConsensusReachedEvent(async ({ match_id }) => {
        const numId = Number(match_id);
        console.log(`[bridge] ConsensusReached for match ${numId} — triggering BolaoCore pull`);
        try {
          const tx = bolao.service.proposeFromOracle(BigInt(match_id as any), ORACLE_PROGRAM_ID);
          await sendTx(tx, signer, `bridge:proposeFromOracle:${numId}`);
          console.log(`[bridge] ✓ match ${numId} proposed in BolaoCore from Oracle`);

          scheduleFinalize(bolao, signer, numId, CHALLENGE_WINDOW_MS + FINALIZE_BUFFER_MS);
        } catch (e: any) {
          console.error(`[bridge] match ${numId} propose failed:`, e?.message);
          console.warn(`[bridge] retry manually: POST /bolao/propose-from-oracle { match_id: ${numId} }`);
        }
      });

      console.log("[boot] ConsensusReached bridge active");

      // Periodic scan for stuck Proposed matches (every 10 min)
      const RECOVER_INTERVAL_MS = 10 * 60 * 1000;
      setInterval(() => {
        recoverProposedMatches(bolao, signer).catch((e) =>
          console.error("[recover-scan] unhandled:", e?.message),
        );
      }, RECOVER_INTERVAL_MS);
      console.log(`[boot] periodic recover-scan every ${RECOVER_INTERVAL_MS / 60_000} min`);

      // Start VARA/USD price-feed loop
      const feederSigner = getGatewaySigner();
      const operatorSigner = (() => {
        try { return getOperatorSigner(); } catch { return feederSigner; }
      })();
      setInterval(() => {
        runPriceFeed(oracle, bolao, ORACLE_PROGRAM_ID, sendTx, feederSigner, operatorSigner).catch((e) =>
          console.error("[price-feed] unhandled:", e?.message),
        );
      }, PRICE_FEED_INTERVAL_MS);
      console.log(`[boot] price-feed loop every ${PRICE_FEED_INTERVAL_MS / 1000}s`);
    })
    .catch((e) => console.error("[boot] GearApi init failed:", e?.message));

  // Start auto-feed scheduler
  if (AUTO_FEED_INTERVAL_MS > 0) {
    setInterval(() => {
      runAutoFeed().catch((e) => console.error("[auto-feed] unhandled:", e?.message));
    }, AUTO_FEED_INTERVAL_MS);
  }
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("Shutting down oracle server...");
  server.close(() => {
    console.log("HTTP server closed.");
    gearApi?.disconnect?.();
    process.exit(0);
  });
}

/* ============================================================
   HELPERS
   ============================================================ */
function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
}

function intEnv(key: string, def: number): number {
  const v = process.env[key];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
