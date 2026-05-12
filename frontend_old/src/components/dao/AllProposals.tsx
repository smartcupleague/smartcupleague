import React, { useEffect, useState, useCallback } from "react";
import styled, { keyframes } from "styled-components";
import { useApi } from "@gear-js/react-hooks";
import { useToast } from "@/hooks/useToast";
import { web3Enable } from "@polkadot/extension-dapp";
import { Program, Service } from "@/hocs/dao";
import type { Proposal as DaoProposal } from "@/hocs/dao";

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as `0x${string}`;

const spin = keyframes`to { transform: rotate(360deg); }`;
const floatIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* ---------- FULL WIDTH + PANEL LOOK ---------- */
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
  background: rgba(36, 0, 22, 0.50);
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
  color: rgba(255, 255, 255, 0.70);
  line-height: 1.35;
`;

const MetaPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.30);
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
  background: rgba(23, 0, 12, 0.50);
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

/**
 * Cambios:
 * - min-width menor (para que no se vea “forzado”)
 * - el panel padre ya limita el ancho a 1180px
 */
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
  border-bottom: 1px solid rgba(255, 0, 110, 0.10);
  background: rgba(23, 0, 12, 0.45);
  white-space: nowrap;
  vertical-align: top;
`;

const Tr = styled.tr<{ faded?: boolean }>`
  ${({ faded }) => faded && "opacity: 0.62;"}
  transition: background 140ms ease-out;

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
    status === "Active" &&
    `
      border-color: rgba(255, 0, 110, 0.40);
      background: rgba(255, 0, 110, 0.14);
    `}
  ${({ status }) =>
    status === "Succeeded" &&
    `
      border-color: rgba(255, 79, 156, 0.40);
      background: rgba(255, 79, 156, 0.14);
    `}
  ${({ status }) =>
    status === "Executed" &&
    `
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(122, 19, 73, 0.35);
    `}
  ${({ status }) =>
    status === "Defeated" &&
    `
      border-color: rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.78);
    `}
  ${({ status }) =>
    status === "Expired" &&
    `
      border-color: rgba(255, 79, 156, 0.28);
      background: rgba(255, 79, 156, 0.10);
    `}
`;

const TypeTag = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 750;
  font-size: 12px;
  padding: 3px 9px;
  border: 1px solid rgba(255, 0, 110, 0.28);
  background: rgba(255, 0, 110, 0.12);
  color: rgba(255, 255, 255, 0.92);
  margin-right: 8px;
`;

const Detail = styled.span`
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
`;

const Mono = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
`;

const Proposer = styled(Mono)`
  color: rgba(255, 79, 156, 0.95);
  font-size: 12.5px;
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

const VotePill = styled.span<{ variant: "yes" | "no" | "abstain" }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 0, 110, 0.16);
  background: rgba(36, 0, 22, 0.35);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);

  ${({ variant }) =>
    variant === "yes" &&
    `
      border-color: rgba(255, 79, 156, 0.35);
      background: rgba(255, 79, 156, 0.14);
    `}
  ${({ variant }) =>
    variant === "no" &&
    `
      border-color: rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.78);
    `}
  ${({ variant }) =>
    variant === "abstain" &&
    `
      border-color: rgba(255, 0, 110, 0.22);
      background: rgba(255, 0, 110, 0.10);
    `}
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

/* ---------- Helpers (igual que tu versión) ---------- */
function getProposalKindString(kind: any): { type: string; details: string | null } {
  if (typeof kind !== "object" || kind === null) return { type: "-", details: null };
  const key = Object.keys(kind)[0];
  switch (key) {
    case "SetFeeBps":
      return { type: "Set Fee BPS", details: `→ ${kind.SetFeeBps.new_fee_bps}` };
    case "SetFinalPrizeBps":
      return { type: "Set Final Prize BPS", details: `→ ${kind.SetFinalPrizeBps.new_final_prize_bps}` };
    case "SetMaxPayoutChunk":
      return { type: "Set Max Payout Chunk", details: `→ ${kind.SetMaxPayoutChunk.new_max_payout_chunk}` };
    case "AddPhase":
      return {
        type: "Add Phase",
        details: `“${kind.AddPhase.name}” (${formatDate(kind.AddPhase.start_time)} ~ ${formatDate(kind.AddPhase.end_time)})`,
      };
    case "AddMatch":
      return {
        type: "Add Match",
        details: `Phase: ${kind.AddMatch.phase}, ${kind.AddMatch.home} vs ${kind.AddMatch.away}, Kickoff: ${formatDate(
          kind.AddMatch.kick_off
        )}`,
      };
    case "SetQuorum":
      return { type: "Set Quorum", details: `→ ${kind.SetQuorum.new_quorum_bps}` };
    case "SetVotingPeriod":
      return { type: "Set Voting Period", details: `→ ${kind.SetVotingPeriod.new_voting_period}` };
    default:
      return { type: key, details: null };
  }
}

function formatStatus(status: any): string {
  if (!status) return "-";
  if (typeof status === "object") return Object.keys(status)[0];
  if (typeof status === "string") return status;
  return "-";
}

function getActorIdShort(actorId: string) {
  return actorId.slice(0, 7) + "…" + actorId.slice(-4);
}

function formatDate(ts: string | number) {
  const n = typeof ts === "string" ? parseInt(ts, 10) : ts;
  if (!n || n === 0) return "-";
  const d = new Date(Number(n) * 1000);
  return (
    d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export const AllProposals: React.FC = () => {
  const { api, isApiReady } = useApi();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<DaoProposal[] | null>(null);

  useEffect(() => {
    void web3Enable("DAO Proposals dApp");
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const data = await svc.queryProposals();
      setProposals(data);
    } catch (e: any) {
      console.error(e);
      setProposals([]);
      toast.error("Failed to fetch proposals");
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, toast]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  return (
    <Container>
      <Card>
        <Header>
          <Brand>
            <TitleWrap>
              <Title>All Proposals</Title>
              <Subtitle>Browse active and historical governance proposals.</Subtitle>
            </TitleWrap>
          </Brand>

          <MetaPill>Smart Cup Governance</MetaPill>
        </Header>

        <TableWrap>
          <TableScroll>
            <Table>
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th>Proposer</Th>
                  <Th>When</Th>
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
                ) : proposals.length === 0 ? (
                  <tr>
                    <Td colSpan={7}>
                      <EmptyMsg>No proposals found</EmptyMsg>
                    </Td>
                  </tr>
                ) : (
                  proposals.map((p) => {
                    const { type, details } = getProposalKindString(p.kind);
                    const statusString = formatStatus(p.status);

                    return (
                      <Tr key={p.id} faded={statusString === "Executed" || statusString === "Expired"}>
                        <Td>
                          <Mono>{p.id}</Mono>
                        </Td>

                        <Td>
                          <TypeTag>{type}</TypeTag>
                          {details && <Detail>{details}</Detail>}
                        </Td>

                        <Td>
                          <Desc>{p.description}</Desc>
                        </Td>

                        <Td>
                          <Proposer title={p.proposer}>{getActorIdShort(p.proposer)}</Proposer>
                        </Td>

                        <Td>
                          <div>
                            <Detail>Starts:</Detail> <span>{formatDate(p.start_time)}</span>
                          </div>
                          <div>
                            <Detail>Ends:</Detail> <span>{formatDate(p.end_time)}</span>
                          </div>
                        </Td>

                        <Td>
                          <Votes>
                            <VotePill variant="yes">
                              <span>Y</span>
                              <Mono>{p.yes}</Mono>
                            </VotePill>
                            <VotePill variant="no">
                              <span>N</span>
                              <Mono>{p.no}</Mono>
                            </VotePill>
                            <VotePill variant="abstain">
                              <span>A</span>
                              <Mono>{p.abstain}</Mono>
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
