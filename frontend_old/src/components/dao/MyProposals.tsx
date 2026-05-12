import React, { useEffect, useMemo, useState, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { useApi, useAccount } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable } from '@polkadot/extension-dapp';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { Program, Service } from '@/hocs/dao';

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as `0x${string}`;

type DaoProposal = {
  id: number;
  proposer: `0x${string}`;
  kind: Record<string, any>;
  description: string;
  start_time: number; // ms
  end_time: number; // ms
  yes: number;
  no: number;
  abstain: number;
  status: string;
  executed: boolean;
};

function normalizeDaoProposal(p: any): DaoProposal {
  return {
    id: Number(p?.id ?? 0),
    proposer: String(p?.proposer ?? '0x') as `0x${string}`,
    kind: (p?.kind ?? {}) as Record<string, any>,
    description: String(p?.description ?? ''),
    start_time: Number(p?.start_time ?? 0),
    end_time: Number(p?.end_time ?? 0),
    yes: Number(p?.yes ?? 0),
    no: Number(p?.no ?? 0),
    abstain: Number(p?.abstain ?? 0),
    status: String(p?.status ?? ''),
    executed: Boolean(p?.executed),
  };
}

const spin = keyframes`to { transform: rotate(360deg); }`;
const floatIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Container = styled.section`
  width: 100%;
  margin: 0;
  padding: 0;
  animation: ${floatIn} 220ms ease-out;
`;

const Card = styled.div`
  width: 100%;
  border-radius: 18px;
  border: 1px solid rgba(255, 0, 110, 0.18);
  background: rgba(23, 0, 12, 0.38);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.32);
  padding: 14px;

  @media (max-width: 820px) {
    padding: 12px;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 0, 110, 0.18);
  background: rgba(36, 0, 22, 0.5);
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const TitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 850;
  letter-spacing: 0.2px;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.2;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.35;
`;

const MetaPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.3);
  background: rgba(255, 0, 110, 0.12);
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
`;

const TableWrap = styled.div`
  margin-top: 12px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(23, 0, 12, 0.5);
  border: 1px solid rgba(255, 0, 110, 0.14);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
`;

const TableScroll = styled.div`
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 9px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(36, 0, 22, 0.55);
  }
  &::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(255, 0, 110, 0.55), rgba(255, 79, 156, 0.55));
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(255, 0, 110, 0.9), rgba(255, 79, 156, 0.9));
  }
`;

const Table = styled.table`
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
  min-width: 860px;
`;

const Th = styled.th`
  padding: 12px 12px;
  font-weight: 750;
  text-align: left;
  border-bottom: 1px solid rgba(255, 0, 110, 0.16);
  background: rgba(36, 0, 22, 0.65);
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.01em;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 11px 12px;
  border-bottom: 1px solid rgba(255, 0, 110, 0.1);
  background: rgba(23, 0, 12, 0.45);
  white-space: nowrap;
  vertical-align: top;
`;

const Tr = styled.tr<{ faded?: boolean }>`
  ${({ faded }) => (faded ? 'opacity: 0.62;' : '')}

  &:hover td {
    background: rgba(58, 3, 34, 0.45);
  }
`;

const StatusTag = styled.span<{ status: string }>`
  display: inline-flex;
  align-items: center;
  min-width: 92px;
  justify-content: center;
  font-size: 12px;
  font-weight: 750;
  border-radius: 999px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 0, 110, 0.18);
  background: rgba(36, 0, 22, 0.38);
  color: rgba(255, 255, 255, 0.92);

  ${({ status }) =>
    status === 'Active'
      ? `
      border-color: rgba(255, 0, 110, 0.40);
      background: rgba(255, 0, 110, 0.14);
    `
      : ''}

  ${({ status }) =>
    status === 'Executed'
      ? `
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(122, 19, 73, 0.35);
    `
      : ''}
`;

const Mono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
`;

const Proposer = styled(Mono)`
  color: rgba(255, 79, 156, 0.95);
  font-size: 12.5px;
`;

const KindTitle = styled.div`
  font-weight: 800;
  color: rgba(255, 255, 255, 0.92);
`;

const Detail = styled.div`
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  line-height: 1.3;
`;

const Desc = styled.div`
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.78);
  max-width: 520px;
  white-space: pre-line;
  line-height: 1.35;
`;

const Votes = styled.div`
  display: inline-flex;
  gap: 8px;
  align-items: center;
`;

const VotePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.16);
  background: rgba(36, 0, 22, 0.35);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
`;

const Spinner = styled.div`
  width: 34px;
  height: 34px;
  border: 3px solid rgba(255, 0, 110, 0.85);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;
  margin: 18px auto;
`;

const EmptyMsg = styled.div`
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  text-align: center;
  padding: 18px 0;
`;

const Notice = styled.div`
  margin-top: 12px;
  border-radius: 16px;
  border: 1px dashed rgba(255, 0, 110, 0.22);
  background: rgba(23, 0, 12, 0.28);
  color: rgba(255, 255, 255, 0.78);
  padding: 14px;
  font-size: 13px;
`;

/* ---------- Helpers ---------- */
function getActorIdShort(actorId: string) {
  if (!actorId) return '-';
  return actorId.slice(0, 8) + '…' + actorId.slice(-6);
}

function formatDateMs(ms: number) {
  if (!ms || ms <= 0) return '-';
  const d = new Date(ms);
  return (
    d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function parseKickoff(input: unknown): string {
  if (typeof input === 'number') return String(input);
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return '-';
    if (s.startsWith('0x')) {
      try {
        return BigInt(s).toString(10);
      } catch {
        return s;
      }
    }
    return s;
  }
  return '-';
}

function getKindLabel(kind: Record<string, any>): { type: string; details: string | null } {
  if (!kind || typeof kind !== 'object') return { type: '-', details: null };
  const key = Object.keys(kind)[0]; 
  const payload = (kind as any)[key];

  switch (key) {
    case 'setFeeBps':
      return { type: 'Set Fee BPS', details: `→ ${payload?.new_fee_bps ?? '-'}` };
    case 'setFinalPrizeBps':
      return { type: 'Set Final Prize BPS', details: `→ ${payload?.new_final_prize_bps ?? '-'}` };
    case 'setMaxPayoutChunk':
      return { type: 'Set Max Payout Chunk', details: `→ ${payload?.new_max_payout_chunk ?? '-'}` };
    case 'addPhase':
      return {
        type: 'Add Phase',
        details: `“${payload?.name ?? '-'}” (${formatDateMs(Number(payload?.start_time ?? 0))} ~ ${formatDateMs(
          Number(payload?.end_time ?? 0),
        )})`,
      };
    case 'addMatch':
      return {
        type: 'Add Match',
        details: `Phase: ${payload?.phase ?? '-'}, ${payload?.home ?? '-'} vs ${
          payload?.away ?? '-'
        }, Kickoff: ${parseKickoff(payload?.kick_off)}`,
      };
    case 'setQuorum':
      return { type: 'Set Quorum', details: `→ ${payload?.new_quorum_bps ?? '-'}` };
    case 'setVotingPeriod':
      return { type: 'Set Voting Period', details: `→ ${payload?.new_voting_period ?? '-'}` };
    default:
      return { type: key, details: null };
  }
}

function toHexAddress(input?: string | null): `0x${string}` | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('0x')) return trimmed.toLowerCase() as `0x${string}`;

  try {
    const u8a = decodeAddress(trimmed);
    return u8aToHex(u8a).toLowerCase() as `0x${string}`;
  } catch {
    return null;
  }
}


export const MyProposals: React.FC = () => {
  const { api, isApiReady } = useApi();
  const toast = useToast();
  const { account } = useAccount();

  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<DaoProposal[] | null>(null);

  const accountHex = useMemo(() => {
    const addr = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(addr);
  }, [account]);

  useEffect(() => {
    void web3Enable('DAO My Proposals dApp');
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);

    try {
      const svc = new Service(new Program(api, PROGRAM_ID));

    
      const raw: unknown = await (svc as any).queryProposals();
      const arr = Array.isArray(raw) ? raw : [];
      const data: DaoProposal[] = arr.map((p: any) => normalizeDaoProposal(p));

      setProposals(data);
    } catch (e: any) {
      console.error(e);
      setProposals([]);
      toast.error('Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, toast]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  const myProposals = useMemo(() => {
    if (!proposals || !accountHex) return [];
    const target = accountHex.toLowerCase();
    return proposals.filter((p) => (p.proposer ?? '').toLowerCase() === target);
  }, [proposals, accountHex]);

  return (
    <Container>
      <Card>
        <Header>
          <Brand>
            <TitleWrap>
              <Title>My Proposals</Title>
              <Subtitle>{accountHex ? 'Filtered by connected wallet' : 'Connect wallet to filter proposals'}</Subtitle>
            </TitleWrap>
          </Brand>

          <MetaPill>{accountHex ? getActorIdShort(accountHex) : 'Wallet not connected'}</MetaPill>
        </Header>

        {!accountHex && <Notice>Connect your wallet to see proposals created by your address.</Notice>}

        <TableWrap>
          <TableScroll>
            <Table>
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>Kind</Th>
                  <Th>Description</Th>
                  <Th>Proposer</Th>
                  <Th>Start / End</Th>
                  <Th>Votes</Th>
                  <Th>Status</Th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <Td colSpan={7}>
                      <Spinner />
                    </Td>
                  </tr>
                ) : proposals === null ? (
                  <tr>
                    <Td colSpan={7}>
                      <EmptyMsg>Loading…</EmptyMsg>
                    </Td>
                  </tr>
                ) : !accountHex ? (
                  <tr>
                    <Td colSpan={7}>
                      <EmptyMsg>Connect wallet to filter.</EmptyMsg>
                    </Td>
                  </tr>
                ) : myProposals.length === 0 ? (
                  <tr>
                    <Td colSpan={7}>
                      <EmptyMsg>No proposals found for this wallet</EmptyMsg>
                    </Td>
                  </tr>
                ) : (
                  myProposals.map((p) => {
                    const { type, details } = getKindLabel(p.kind);
                    const statusString = p.status ?? '-';
                    const faded = statusString === 'Executed' || p.executed;

                    return (
                      <Tr key={p.id} faded={faded}>
                        <Td>
                          <Mono>{p.id}</Mono>
                        </Td>

                        <Td>
                          <KindTitle>{type}</KindTitle>
                          <Detail>{details ?? '-'}</Detail>
                        </Td>

                        <Td>
                          <Desc>{p.description}</Desc>
                        </Td>

                        <Td>
                          <Proposer title={p.proposer}>{getActorIdShort(p.proposer)}</Proposer>
                        </Td>

                        <Td>
                          <div>
                            <Detail>
                              <strong>Start:</strong> {formatDateMs(p.start_time)}
                            </Detail>
                          </div>
                          <div>
                            <Detail>
                              <strong>End:</strong> {formatDateMs(p.end_time)}
                            </Detail>
                          </div>
                        </Td>

                        <Td>
                          <Votes>
                            <VotePill>
                              <span>Y</span> <Mono>{p.yes}</Mono>
                            </VotePill>
                            <VotePill>
                              <span>N</span> <Mono>{p.no}</Mono>
                            </VotePill>
                            <VotePill>
                              <span>A</span> <Mono>{p.abstain}</Mono>
                            </VotePill>
                          </Votes>
                        </Td>

                        <Td>
                          <StatusTag status={statusString}>{statusString}</StatusTag>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableScroll>
        </TableWrap>
      </Card>
    </Container>
  );
};
