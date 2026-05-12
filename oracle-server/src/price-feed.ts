import { Program as OracleProgram } from './oracle';
import { BolaoProgram } from './bolao';

/* ── CoinGecko endpoint ───────────────────────────────────────────────────── */
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=vara-network&vs_currencies=usd';

/** Accepted range: $0.01 – $100 per VARA, expressed in micro-USD. */
const PRICE_MIN_MICRO = 10_000;
const PRICE_MAX_MICRO = 100_000_000;

/**
 * Fetches the current VARA/USD price from CoinGecko and converts it to
 * micro-USD (i.e. USD × 1_000_000, rounded to nearest integer).
 *
 * Returns null when:
 *  - the fetch or JSON parse fails
 *  - the converted value falls outside [10_000, 100_000_000]
 *
 * Supports an optional COINGECKO_API_KEY env var — when set, it is sent as
 * the `x-cg-demo-api-key` header (CoinGecko demo plan requirement).
 */
export async function fetchVaraUsdMicro(): Promise<number | null> {
  try {
    const headers: Record<string, string> = {};
    const apiKey = process.env.COINGECKO_API_KEY;
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

    const res = await fetch(COINGECKO_URL, { headers });
    if (!res.ok) {
      console.error(`[price-feed] CoinGecko returned ${res.status} ${res.statusText}`);
      return null;
    }

    const body = (await res.json()) as { 'vara-network'?: { usd?: number } };
    const usd = body['vara-network']?.usd;

    if (typeof usd !== 'number' || !Number.isFinite(usd)) {
      console.error('[price-feed] Unexpected CoinGecko response shape:', body);
      return null;
    }

    const micro = Math.round(usd * 1_000_000);

    if (micro < PRICE_MIN_MICRO || micro > PRICE_MAX_MICRO) {
      console.warn(
        `[price-feed] VARA/USD price out of accepted range: $${usd} (${micro} micro-USD). Skipping.`,
      );
      return null;
    }

    return micro;
  } catch (e: any) {
    console.error('[price-feed] Failed to fetch VARA/USD price:', e?.message);
    return null;
  }
}

/**
 * Main price-feed loop iteration.
 *
 * 1. Fetches VARA/USD from CoinGecko (via fetchVaraUsdMicro).
 * 2. Pushes price on-chain via oracle.service.setVaraUsdPrice().
 * 3. If BOLAO_PROGRAM_ID is set, triggers BolaoCore price refresh via
 *    bolao.service.refreshVaraPrice(oracleProgramId).
 *
 * Errors from either on-chain call are caught and logged — they do NOT
 * propagate so that one failing cycle does not crash the server.
 *
 * @param oracle          - OracleProgram client (feeder keypair must be set externally via withAccount)
 * @param bolao           - BolaoProgram client (operator keypair must be set externally via withAccount)
 * @param oracleProgramId - on-chain ActorId of the Oracle-Program (hex string)
 * @param sendTx          - helper that attaches the signer and calls signAndSend
 * @param feederSigner    - sr25519 keypair for the oracle feeder
 * @param operatorSigner  - sr25519 keypair for the BolaoCore operator
 */
export async function runPriceFeed(
  oracle: OracleProgram,
  bolao: BolaoProgram,
  oracleProgramId: string,
  sendTx: (tx: any, signer: any, label: string) => Promise<any>,
  feederSigner: any,
  operatorSigner: any,
): Promise<void> {
  const micro = await fetchVaraUsdMicro();
  if (micro === null) {
    console.warn('[price-feed] Skipping cycle — price unavailable or out of range');
    return;
  }

  // Push price to Oracle-Program (signed by feeder).
  try {
    const tx = oracle.service.setVaraUsdPrice(micro);
    await sendTx(tx, feederSigner, 'price-feed:setVaraUsdPrice');
    console.log(`[price-feed] Oracle price updated: ${micro} micro-USD ($${(micro / 1_000_000).toFixed(6)})`);
  } catch (e: any) {
    console.error('[price-feed] setVaraUsdPrice failed:', e?.message);
    return;
  }

  // Propagate to BolaoCore only when BOLAO_PROGRAM_ID is configured.
  const bolaoProgramId = process.env.BOLAO_PROGRAM_ID ?? '';
  if (!bolaoProgramId) {
    console.warn('[price-feed] BOLAO_PROGRAM_ID not set — skipping BolaoCore refresh');
    return;
  }

  try {
    const tx = bolao.service.refreshVaraPrice(oracleProgramId);
    await sendTx(tx, operatorSigner, 'price-feed:refreshVaraPrice');
    console.log('[price-feed] BolaoCore VARA price refreshed');
  } catch (e: any) {
    console.error('[price-feed] refreshVaraPrice failed:', e?.message);
    // Do NOT rethrow — BolaoCore refresh is best-effort.
  }
}
