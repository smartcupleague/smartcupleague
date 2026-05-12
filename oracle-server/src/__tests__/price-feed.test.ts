import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchVaraUsdMicro, runPriceFeed } from '../price-feed';

// ── helpers ──────────────────────────────────────────────────────────────────

const stubFetch = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });

const makeOracle = (setVaraFn = vi.fn()) => ({
  service: { setVaraUsdPrice: setVaraFn },
});

const makeBolao = (refreshFn = vi.fn()) => ({
  service: { refreshVaraPrice: refreshFn },
});

// ── fetchVaraUsdMicro ────────────────────────────────────────────────────────

describe('fetchVaraUsdMicro', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns micro-USD for a valid price', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.05 } }));
    expect(await fetchVaraUsdMicro()).toBe(50_000);
  });

  it('rounds to nearest integer', async () => {
    // $0.0500015 * 1_000_000 = 50001.5 → Math.round → 50_002
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.0500015 } }));
    expect(await fetchVaraUsdMicro()).toBe(50_002);
  });

  it('accepts lower boundary ($0.01 = 10_000 micro)', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.01 } }));
    expect(await fetchVaraUsdMicro()).toBe(10_000);
  });

  it('accepts upper boundary ($100 = 100_000_000 micro)', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 100 } }));
    expect(await fetchVaraUsdMicro()).toBe(100_000_000);
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await fetchVaraUsdMicro()).toBeNull();
  });

  it('returns null on non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', stubFetch(null, false, 429));
    expect(await fetchVaraUsdMicro()).toBeNull();
  });

  it('returns null when response shape is unexpected', async () => {
    vi.stubGlobal('fetch', stubFetch({ unexpected: true }));
    expect(await fetchVaraUsdMicro()).toBeNull();
  });

  it('returns null when usd field is a string', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 'not-a-number' } }));
    expect(await fetchVaraUsdMicro()).toBeNull();
  });

  it('returns null when price is below range ($0.005 → 5_000 micro)', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.005 } }));
    expect(await fetchVaraUsdMicro()).toBeNull();
  });

  it('returns null when price is above range ($200 → 200_000_000 micro)', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 200 } }));
    expect(await fetchVaraUsdMicro()).toBeNull();
  });
});

// ── runPriceFeed ─────────────────────────────────────────────────────────────

describe('runPriceFeed', () => {
  const ORACLE_ID = '0xdeadbeef';
  let sendTx: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendTx = vi.fn().mockResolvedValue(undefined);
    delete process.env.BOLAO_PROGRAM_ID;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('skips all tx calls when fetch returns null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const oracle = makeOracle();
    const bolao = makeBolao();

    await runPriceFeed(oracle as any, bolao as any, ORACLE_ID, sendTx, {}, {});

    expect(sendTx).not.toHaveBeenCalled();
  });

  it('does not call refreshVaraPrice when setVaraUsdPrice throws', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.05 } }));
    const setFn = vi.fn().mockReturnValue({});
    const refreshFn = vi.fn();
    sendTx.mockRejectedValueOnce(new Error('chain error'));

    await runPriceFeed(
      makeOracle(setFn) as any,
      makeBolao(refreshFn) as any,
      ORACLE_ID, sendTx, {}, {},
    );

    expect(sendTx).toHaveBeenCalledTimes(1);
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it('does not call refreshVaraPrice when BOLAO_PROGRAM_ID is not set', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.05 } }));
    const setFn = vi.fn().mockReturnValue({});
    const refreshFn = vi.fn();

    await runPriceFeed(
      makeOracle(setFn) as any,
      makeBolao(refreshFn) as any,
      ORACLE_ID, sendTx, {}, {},
    );

    expect(sendTx).toHaveBeenCalledTimes(1);
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it('calls setVaraUsdPrice then refreshVaraPrice when fully configured', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.05 } }));
    process.env.BOLAO_PROGRAM_ID = '0xabcd1234';
    const txSet = {};
    const txRefresh = {};
    const setFn = vi.fn().mockReturnValue(txSet);
    const refreshFn = vi.fn().mockReturnValue(txRefresh);

    await runPriceFeed(
      makeOracle(setFn) as any,
      makeBolao(refreshFn) as any,
      ORACLE_ID, sendTx, { feeder: true }, { operator: true },
    );

    expect(setFn).toHaveBeenCalledWith(50_000);
    expect(sendTx).toHaveBeenNthCalledWith(1, txSet, { feeder: true }, 'price-feed:setVaraUsdPrice');
    expect(refreshFn).toHaveBeenCalledWith(ORACLE_ID);
    expect(sendTx).toHaveBeenNthCalledWith(2, txRefresh, { operator: true }, 'price-feed:refreshVaraPrice');
    expect(sendTx).toHaveBeenCalledTimes(2);
  });

  it('does not throw when refreshVaraPrice fails (best-effort)', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'vara-network': { usd: 0.05 } }));
    process.env.BOLAO_PROGRAM_ID = '0xabcd1234';
    const setFn = vi.fn().mockReturnValue({});
    const refreshFn = vi.fn().mockReturnValue({});
    sendTx
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('refresh error'));

    await expect(
      runPriceFeed(makeOracle(setFn) as any, makeBolao(refreshFn) as any, ORACLE_ID, sendTx, {}, {}),
    ).resolves.toBeUndefined();

    expect(sendTx).toHaveBeenCalledTimes(2);
  });
});
