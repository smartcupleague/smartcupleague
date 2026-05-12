import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useAccount, useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable, web3FromSource } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/lib';
import { TransactionBuilder } from 'sails-js';
import { HexString } from '@gear-js/api';

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as string;

type AnyResult = any;

type MatchInfo = {
  match_id: string;
  phase?: string;
  home?: string;
  away?: string;
  kick_off?: string;
  result?: AnyResult;
};

const Wrap = styled.div`
  display: grid;
  gap: 12px;
`;

const TopRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

const Title = styled.div`
  .t {
    font-size: 14px;
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
  }
  .s {
    margin-top: 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
    line-height: 1.35;
  }
`;

const Tools = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const SoftBtn = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.12);
  color: rgba(255, 255, 255, 0.88);
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 900;
  font-size: 13px;

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Pill = styled.span<{ $tone?: 'green' | 'pink' | 'gray' }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;

  border: 1px solid
    ${({ $tone }) =>
      $tone === 'green'
        ? 'rgba(40, 255, 160, .22)'
        : $tone === 'pink'
          ? 'rgba(255,0,110,.25)'
          : 'rgba(255,255,255,.12)'};

  background: ${({ $tone }) =>
    $tone === 'green' ? 'rgba(40,255,160,.08)' : $tone === 'pink' ? 'rgba(255,0,110,.10)' : 'rgba(0,0,0,.12)'};

  color: rgba(255, 255, 255, 0.86);
`;

const Section = styled.section`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const SectionHead = styled.div`
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;

  .h {
    font-weight: 950;
    color: rgba(255, 255, 255, 0.92);
  }
  .m {
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
  }
`;

const List = styled.div`
  padding: 12px;
  display: grid;
  gap: 12px;
`;

const Row = styled.div`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);

  padding: 12px;
  display: grid;
  grid-template-columns: 1.4fr 0.9fr 240px;
  gap: 12px;
  align-items: center;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Teams = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;

  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .team {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;

    .name {
      font-weight: 950;
      color: rgba(255, 255, 255, 0.92);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .vs {
    font-weight: 950;
    opacity: 0.65;
  }

  .meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
  }

  .meta span {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.12);
  }
`;

const ScoreBox = styled.div`
  border-radius: 16px;
  border: 1px solid rgba(255, 0, 110, 0.22);
  background: radial-gradient(520px 180px at 20% 15%, rgba(255, 0, 110, 0.18), transparent 60%), rgba(0, 0, 0, 0.12);
  padding: 10px 12px;
  display: grid;
  place-items: center;
  text-align: center;

  .label {
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.8px;
    opacity: 0.75;
    margin-bottom: 4px;
  }
  .score {
    font-size: 22px;
    font-weight: 950;
    color: rgba(255, 255, 255, 0.95);
  }
  .sub {
    font-size: 11px;
    opacity: 0.72;
    margin-top: 2px;
  }
`;

const Actions = styled.div`
  display: grid;
  gap: 8px;
  align-content: center;

  @media (max-width: 980px) {
    justify-items: stretch;
  }
`;

const PrimaryBtn = styled.button`
  border: 1px solid rgba(255, 0, 110, 0.25);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 950;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.95);
  background:
    radial-gradient(260px 140px at 30% 20%, rgba(255, 0, 110, 0.65), transparent 60%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  box-shadow: 0 10px 28px rgba(255, 0, 110, 0.18);
  transition:
    transform 0.15s ease,
    filter 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.05);
  }
  &:active {
    transform: translateY(0);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const Tiny = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
  text-align: center;
`;

type ParsedStatus = {
  tag: 'OPEN' | 'PROPOSED' | 'FINAL';
  label: 'OPEN' | 'PROPOSED' | 'FINAL';
  home: number;
  away: number;
  penaltyWinner: 'Home' | 'Away' | null;
};

function parseResult(result: any): ParsedStatus {
  const base: ParsedStatus = { tag: 'OPEN', label: 'OPEN', home: 0, away: 0, penaltyWinner: null };

  try {
    if (result?.Finalized) {
      const sc = result.Finalized?.score ?? {};
      return {
        tag: 'FINAL',
        label: 'FINAL',
        home: Number(sc.home ?? 0) || 0,
        away: Number(sc.away ?? 0) || 0,
        penaltyWinner: (result.Finalized?.penalty_winner ?? null) as any,
      };
    }
    if (result?.Proposed) {
      const sc = result.Proposed?.score ?? {};
      return {
        tag: 'PROPOSED',
        label: 'PROPOSED',
        home: Number(sc.home ?? 0) || 0,
        away: Number(sc.away ?? 0) || 0,
        penaltyWinner: (result.Proposed?.penalty_winner ?? null) as any,
      };
    }
    if (result?.Unresolved) return base;

    if (result?.finalized) {
      const sc = result.finalized?.score ?? {};
      return {
        tag: 'FINAL',
        label: 'FINAL',
        home: Number(sc.home ?? 0) || 0,
        away: Number(sc.away ?? 0) || 0,
        penaltyWinner: (result.finalized?.penalty_winner ?? null) as any,
      };
    }
    if (result?.proposed) {
      const sc = result.proposed?.score ?? {};
      return {
        tag: 'PROPOSED',
        label: 'PROPOSED',
        home: Number(sc.home ?? 0) || 0,
        away: Number(sc.away ?? 0) || 0,
        penaltyWinner: (result.proposed?.penalty_winner ?? null) as any,
      };
    }
    if (result?.unresolved) return base;

    return base;
  } catch {
    return base;
  }
}

function formatKickoff(kickOff?: string) {
  const n = Number(kickOff ?? '0');
  if (!Number.isFinite(n) || n <= 0) return '—';
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  return new Date(ms).toLocaleString(undefined, {
    year: '2-digit',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FinalizeResultContainer() {
  const { api, isApiReady } = useApi();
  const { account } = useAccount();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchInfo[]>([]);

  useEffect(() => {
    void web3Enable('Bolao Finalize Result');
  }, []);

  const connected = !!account?.decodedAddress;

  const fetchMatches = useCallback(async () => {
    if (!api || !isApiReady || !PROGRAM_ID) return;
    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID as HexString));
      const state = (await (svc as any).queryState()) as any;

      const listRaw = Array.isArray(state?.matches) ? state.matches : [];
      const list: MatchInfo[] = listRaw.map((m: any) => ({
        match_id: String(m?.match_id ?? ''),
        phase: String(m?.phase ?? ''),
        home: String(m?.home ?? ''),
        away: String(m?.away ?? ''),
        kick_off: String(m?.kick_off ?? '0'),
        result: m?.result ?? null,
      }));

      list.sort((a, b) => Number(a.match_id) - Number(b.match_id));
      setMatches(list);
    } catch (e) {
      console.error('fetchMatches error', e);
      setMatches([]);
      toast.error('Failed to read matches from queryState');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, toast]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  const canFinalize = useMemo(() => {
    return matches.filter((m) => parseResult(m.result).tag === 'PROPOSED');
  }, [matches]);

  const stats = useMemo(() => {
    const total = matches.length;
    let open = 0,
      proposed = 0,
      finalized = 0;
    for (const m of matches) {
      const r = parseResult(m.result).tag;
      if (r === 'OPEN') open++;
      if (r === 'PROPOSED') proposed++;
      if (r === 'FINAL') finalized++;
    }
    return { total, open, proposed, finalized };
  }, [matches]);

  const finalizeOne = useCallback(
    async (matchId: string) => {
      if (!connected) {
        toast.error('Connect your wallet first');
        return;
      }
      if (!api || !isApiReady) {
        toast.error('Node API not ready');
        return;
      }
      if (!PROGRAM_ID) {
        toast.error('Missing env: VITE_BOLAOCOREPROGRAM');
        return;
      }

      try {
        setFinalizingId(matchId);

        const svc = new Service(new Program(api, PROGRAM_ID as HexString));
        const tx: TransactionBuilder<unknown> = (svc as any).finalizeResult(BigInt(matchId));

        const { signer } = await web3FromSource(account!.meta.source);
        tx.withAccount(account!.decodedAddress, { signer }).withValue(0n);

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();
        toast.info(`Included in block ${blockHash}`);
        await response();

        toast.success(`Match #${matchId} finalized ✅`);
        await fetchMatches();
      } catch (e) {
        console.error(e);
        toast.error('Failed to finalize result');
      } finally {
        setFinalizingId(null);
      }
    },
    [connected, api, isApiReady, account, alert, fetchMatches],
  );

  const disabledReason = useMemo(() => {
    if (!connected) return 'Connect wallet';
    if (!api || !isApiReady) return 'API not ready';
    if (!PROGRAM_ID) return 'Missing PROGRAM_ID';
    return null;
  }, [connected, api, isApiReady]);

  return (
    <Wrap>
      <TopRow>
        <Title>
          <div className="t">Finalize Results</div>
          <div className="s">
            Reads all matches from <b>queryState().matches</b>. Finalize is available only when a match is{' '}
            <b>PROPOSED</b>.
          </div>
        </Title>

        <Tools>
          <Pill $tone="gray">Total: {stats.total}</Pill>
          <Pill $tone="gray">Open: {stats.open}</Pill>
          <Pill $tone="pink">Proposed: {stats.proposed}</Pill>
          <Pill $tone="green">Final: {stats.finalized}</Pill>
          <SoftBtn onClick={fetchMatches} disabled={loading} type="button" title="Refresh">
            {loading ? 'Refreshing…' : 'Refresh'}
          </SoftBtn>
        </Tools>
      </TopRow>

      {/* ✅ Can finalize */}
      <Section>
        <SectionHead>
          <div>
            <div className="h">Matches you can finalize</div>
            <div className="m">Only PROPOSED matches appear here.</div>
          </div>
          <div className="m">{canFinalize.length} available</div>
        </SectionHead>

        <List>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,.72)', padding: 6 }}>Loading…</div>
          ) : canFinalize.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,.72)', padding: 6 }}>No proposed matches to finalize.</div>
          ) : (
            canFinalize.map((m) => {
              const r = parseResult(m.result);
              const penaltyNote = r.penaltyWinner ? ` • Penalties: ${r.penaltyWinner}` : '';

              return (
                <Row key={`can-${m.match_id}`}>
                  <Teams>
                    <div className="line">
                      <div className="team">
                        <span className="name">{m.home || '—'}</span>
                      </div>
                      <div className="vs">vs</div>
                      <div className="team">
                        <span className="name">{m.away || '—'}</span>
                      </div>
                    </div>

                    <div className="meta">
                      <span>#{m.match_id}</span>
                      <span>{m.phase || '—'}</span>
                      <span>Kickoff: {formatKickoff(m.kick_off)}</span>
                      <span>
                        Status: <b style={{ color: 'rgba(255,255,255,.92)' }}>PROPOSED</b>
                        {penaltyNote}
                      </span>
                    </div>
                  </Teams>

                  <ScoreBox>
                    <div className="label">PROPOSED</div>
                    <div className="score">
                      {r.home}-{r.away}
                    </div>
                    <div className="sub">Proposed score</div>
                  </ScoreBox>

                  <Actions>
                    <PrimaryBtn
                      type="button"
                      onClick={() => finalizeOne(m.match_id)}
                      disabled={!!disabledReason || finalizingId === m.match_id}>
                      {finalizingId === m.match_id ? 'Finalizing…' : 'Finalize result'}
                    </PrimaryBtn>
                    <Tiny>{disabledReason ? disabledReason : `Match #${m.match_id}`}</Tiny>
                  </Actions>
                </Row>
              );
            })
          )}
        </List>
      </Section>

      {/* ✅ All matches */}
      <Section>
        <SectionHead>
          <div>
            <div className="h">All registered matches (queryState)</div>
            <div className="m">Shows current state: OPEN / PROPOSED / FINAL with scores.</div>
          </div>
          <div className="m">{matches.length} matches</div>
        </SectionHead>

        <List>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,.72)', padding: 6 }}>Loading…</div>
          ) : matches.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,.72)', padding: 6 }}>No matches found in contract state.</div>
          ) : (
            matches.map((m) => {
              const r = parseResult(m.result);

              const statusPill =
                r.tag === 'FINAL' ? (
                  <Pill $tone="green">FINAL</Pill>
                ) : r.tag === 'PROPOSED' ? (
                  <Pill $tone="pink">PROPOSED</Pill>
                ) : (
                  <Pill $tone="gray">OPEN</Pill>
                );

              const penaltyNote = r.penaltyWinner ? ` (${r.penaltyWinner} on pens)` : '';

              return (
                <Row key={`all-${m.match_id}`}>
                  <Teams>
                    <div className="line">
                      <div className="team">
                        <span className="name">{m.home || '—'}</span>
                      </div>
                      <div className="vs">vs</div>
                      <div className="team">
                        <span className="name">{m.away || '—'}</span>
                      </div>
                    </div>

                    <div className="meta">
                      <span>#{m.match_id}</span>
                      <span>{m.phase || '—'}</span>
                      <span>Kickoff: {formatKickoff(m.kick_off)}</span>
                      <span>
                        Current:{' '}
                        <b style={{ color: 'rgba(255,255,255,.92)' }}>
                          {r.home}-{r.away}
                        </b>
                        {penaltyNote}
                      </span>
                      <span style={{ padding: 0, border: 'none', background: 'transparent' }}>{statusPill}</span>
                    </div>
                  </Teams>

                  <ScoreBox>
                    <div className="label">{r.label}</div>
                    <div className="score">
                      {r.home}-{r.away}
                    </div>
                    <div className="sub">Current result</div>
                  </ScoreBox>

                  <Actions>
                    {r.tag === 'PROPOSED' ? (
                      <>
                        <PrimaryBtn
                          type="button"
                          onClick={() => finalizeOne(m.match_id)}
                          disabled={!!disabledReason || finalizingId === m.match_id}>
                          {finalizingId === m.match_id ? 'Finalizing…' : 'Finalize result'}
                        </PrimaryBtn>
                        <Tiny>{disabledReason ? disabledReason : 'Finalize is available'}</Tiny>
                      </>
                    ) : r.tag === 'FINAL' ? (
                      <>
                        <PrimaryBtn type="button" disabled>
                          Finalized ✅
                        </PrimaryBtn>
                        <Tiny>This match is already finalized.</Tiny>
                      </>
                    ) : (
                      <>
                        <PrimaryBtn type="button" disabled>
                          Not finalizable
                        </PrimaryBtn>
                        <Tiny>Match must be PROPOSED before finalizing.</Tiny>
                      </>
                    )}
                  </Actions>
                </Row>
              );
            })
          )}
        </List>
      </Section>
    </Wrap>
  );
}
