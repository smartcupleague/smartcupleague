#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SailsDecoder } from "../indexer/lib/sails-decoder.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_IDL_PATH = resolve(
  REPO_ROOT,
  "agent-skills/smartcup-programs/references/idl/bolao_program.idl",
);
const DEFAULT_OUTPUT_PATH = resolve(
  REPO_ROOT,
  "docs/audits/world-cup-2026-vara-events.json",
);
const PORTAL_URL = "https://portal.sqd.dev/datasets/vara/stream";
const PROGRAM_ID =
  "0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894";
const ZERO_ADDRESS = `0x${"0".repeat(64)}`;

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function asInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return number;
}

function asPlanck(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  throw new Error(`Cannot convert ${String(value)} to Planck`);
}

function normalizeWallet(value) {
  return String(value).toLowerCase();
}

function jsonSafe(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]),
    );
  }
  return value;
}

function addPlanck(map, wallet, amount) {
  const key = normalizeWallet(wallet);
  map.set(key, (map.get(key) ?? 0n) + asPlanck(amount));
}

function addCount(map, wallet) {
  const key = normalizeWallet(wallet);
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedObject(map, stringifyBigInt = false) {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        stringifyBigInt && typeof value === "bigint"
          ? value.toString()
          : value,
      ]),
  );
}

async function wait(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function fetchChunk(fromBlock, toBlock, attempt = 1) {
  const response = await fetch(PORTAL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "substrate",
      fromBlock,
      toBlock,
      fields: {
        block: { number: true, timestamp: true },
        event: { index: true, args: true },
      },
      gearUserMessagesSent: [{ programId: [PROGRAM_ID] }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const body = await response.text();
    if (attempt < 6 && (response.status === 429 || response.status >= 500)) {
      await wait(Math.min(1_000 * 2 ** attempt, 20_000));
      return fetchChunk(fromBlock, toBlock, attempt + 1);
    }
    throw new Error(
      `SQD ${response.status} for blocks ${fromBlock}-${toBlock}: ${body}`,
    );
  }

  if (!response.body) {
    throw new Error(`SQD returned no body for blocks ${fromBlock}-${toBlock}`);
  }

  const blocks = [];
  const decoder = new TextDecoder();
  let pending = "";

  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) blocks.push(JSON.parse(line));
    }
  }

  pending += decoder.decode();
  if (pending.trim()) blocks.push(JSON.parse(pending));
  return blocks;
}

async function main() {
  const fromBlock = asInteger(readArg("--from", "33000000"), "--from");
  const toBlock = asInteger(readArg("--to", "34860000"), "--to");
  const chunkSize = asInteger(readArg("--chunk-size", "50000"), "--chunk-size");
  const outputPath = resolve(readArg("--output", DEFAULT_OUTPUT_PATH));
  const idlPath = resolve(readArg("--idl", DEFAULT_IDL_PATH));

  if (fromBlock > toBlock) {
    throw new Error("--from cannot be greater than --to");
  }

  const sailsDecoder = await SailsDecoder.new(idlPath);
  const decodedEvents = [];
  const undecodedEvents = [];
  const messageIds = new Set();
  let firstReturnedBlock = null;
  let lastReturnedBlock = null;

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    process.stderr.write(`[audit] fetching ${start}-${end}\n`);
    const blocks = await fetchChunk(start, end);

    for (const block of blocks) {
      const blockNumber = Number(block.header?.number);
      if (Number.isSafeInteger(blockNumber)) {
        firstReturnedBlock =
          firstReturnedBlock === null
            ? blockNumber
            : Math.min(firstReturnedBlock, blockNumber);
        lastReturnedBlock =
          lastReturnedBlock === null
            ? blockNumber
            : Math.max(lastReturnedBlock, blockNumber);
      }

      for (const event of block.events ?? []) {
        const message = event.args?.message;
        if (
          !message?.id ||
          messageIds.has(message.id) ||
          message.source?.toLowerCase() !== PROGRAM_ID ||
          message.destination?.toLowerCase() !== ZERO_ADDRESS ||
          !message.payload ||
          message.payload === "0x"
        ) {
          continue;
        }

        messageIds.add(message.id);
        const provenance = {
          blockNumber,
          timestamp: new Date(block.header.timestamp).toISOString(),
          eventIndex: event.index ?? null,
          messageId: message.id,
        };

        try {
          const decoded = sailsDecoder.decodeEvent(event);
          decodedEvents.push({
            ...provenance,
            service: decoded.service,
            event: decoded.method,
            payload: jsonSafe(decoded.payload),
          });
        } catch (error) {
          undecodedEvents.push({
            ...provenance,
            payload: message.payload,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  decodedEvents.sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      (left.eventIndex ?? 0) - (right.eventIndex ?? 0),
  );
  undecodedEvents.sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      (left.eventIndex ?? 0) - (right.eventIndex ?? 0),
  );

  const eventCounts = new Map();
  const matchPredictionCounts = new Map();
  const championshipPickCounts = new Map();
  const matchRewardPayouts = new Map();
  const freebetPrincipalReturns = new Map();
  const finalPrizeClaims = new Map();
  const finalPrizePoolFinalizations = [];

  for (const event of decodedEvents) {
    eventCounts.set(event.event, (eventCounts.get(event.event) ?? 0) + 1);

    switch (event.event) {
      case "BetAccepted":
      case "FreebetBetAccepted":
        addCount(matchPredictionCounts, event.payload[0]);
        break;
      case "PodiumPickSubmitted":
        addCount(championshipPickCounts, event.payload[0]);
        break;
      case "MatchRewardClaimed":
        addPlanck(matchRewardPayouts, event.payload[1], event.payload[2]);
        break;
      case "FreebetPrincipalReturned":
        addPlanck(
          freebetPrincipalReturns,
          event.payload[0],
          event.payload[2],
        );
        break;
      case "FinalPrizeClaimed":
        addPlanck(finalPrizeClaims, event.payload[0], event.payload[1]);
        break;
      case "FinalPrizePoolFinalized":
        finalPrizePoolFinalizations.push({
          blockNumber: event.blockNumber,
          timestamp: event.timestamp,
          allocatedPlanck: asPlanck(event.payload[0]).toString(),
          dustPlanck: asPlanck(event.payload[1]).toString(),
        });
        break;
      default:
        break;
    }
  }

  const evidenceDigest = createHash("sha256")
    .update(JSON.stringify({ decodedEvents, undecodedEvents }))
    .digest("hex");

  const report = {
    schemaVersion: 1,
    tournament: "World Cup 2026",
    programId: PROGRAM_ID,
    source: {
      kind: "sqd-vara-archive",
      endpoint: PORTAL_URL,
      requestedFromBlock: fromBlock,
      requestedToBlock: toBlock,
      firstReturnedBlock,
      lastReturnedBlock,
      generatedAt: new Date().toISOString(),
      idlPath: idlPath.replace(`${REPO_ROOT}/`, ""),
      evidenceSha256: evidenceDigest,
    },
    reconciliation: {
      decodedEventCount: decodedEvents.length,
      undecodedEventCount: undecodedEvents.length,
      eventCounts: sortedObject(eventCounts),
      totalMatchPredictions: [...matchPredictionCounts.values()].reduce(
        (total, count) => total + count,
        0,
      ),
      totalChampionshipPickSubmissions: [
        ...championshipPickCounts.values(),
      ].reduce((total, count) => total + count, 0),
      finalPrizePoolFinalizations,
    },
    wallets: {
      matchPredictionCounts: sortedObject(matchPredictionCounts),
      championshipPickCounts: sortedObject(championshipPickCounts),
      matchRewardPayoutsPlanck: sortedObject(matchRewardPayouts, true),
      freebetPrincipalReturnsPlanck: sortedObject(
        freebetPrincipalReturns,
        true,
      ),
      finalPrizeClaimsPlanck: sortedObject(finalPrizeClaims, true),
    },
    decodedEvents,
    undecodedEvents,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(`[audit] wrote ${outputPath}\n`);
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath,
        decodedEventCount: decodedEvents.length,
        undecodedEventCount: undecodedEvents.length,
        eventCounts: report.reconciliation.eventCounts,
        totalMatchPredictions:
          report.reconciliation.totalMatchPredictions,
        totalChampionshipPickSubmissions:
          report.reconciliation.totalChampionshipPickSubmissions,
        firstReturnedBlock,
        lastReturnedBlock,
        evidenceSha256: evidenceDigest,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        code: "WORLD_CUP_AUDIT_FAILED",
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
