import React, { useCallback, useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { useAccount, useApi } from "@gear-js/react-hooks";
import { useToast } from "@/hooks/useToast";
import { web3Enable, web3FromSource } from "@polkadot/extension-dapp";
import { TransactionBuilder } from "sails-js";
import { Program, Service } from "@/hocs/dao";
import type { ProposalKind } from "@/hocs/dao";

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM;

// Human-readable proposal categories per spec
// These are UI labels that map to the underlying contract proposal kinds
const PROPOSAL_CATEGORY_LABELS: Record<string, string> = {
  SetFeeBps: "Protocol Parameter Update — Set Fee (BPS)",
  SetFinalPrizeBps: "Protocol Parameter Update — Set Final Prize (BPS)",
  SetMaxPayoutChunk: "Protocol Parameter Update — Set Max Payout Chunk",
  AddPhase: "Create New Tournament — Add Phase",
  AddMatch: "Create New Tournament — Add Match",
  SetQuorum: "Governance Parameter Update — Set Quorum (BPS)",
  SetVotingPeriod: "Governance Parameter Update — Set Voting Period (seconds)",
};

const PROPOSAL_KIND_OPTIONS = [
  { value: "SetFeeBps", label: PROPOSAL_CATEGORY_LABELS.SetFeeBps },
  { value: "SetFinalPrizeBps", label: PROPOSAL_CATEGORY_LABELS.SetFinalPrizeBps },
  { value: "SetMaxPayoutChunk", label: PROPOSAL_CATEGORY_LABELS.SetMaxPayoutChunk },
  { value: "AddPhase", label: PROPOSAL_CATEGORY_LABELS.AddPhase },
  { value: "AddMatch", label: PROPOSAL_CATEGORY_LABELS.AddMatch },
  { value: "SetQuorum", label: PROPOSAL_CATEGORY_LABELS.SetQuorum },
  { value: "SetVotingPeriod", label: PROPOSAL_CATEGORY_LABELS.SetVotingPeriod },
  // TODO: The following proposal types require additional backend support
  // { value: "TreasuryFunding", label: "Treasury Funding Proposal" },
  // { value: "ComplianceSafety", label: "Compliance & Safety Proposal" },
  // { value: "Membership", label: "Membership Proposal" },
  // { value: "Informational", label: "Informational / Signaling Proposal" },
] as const;

type Kind =
  | "SetFeeBps"
  | "SetFinalPrizeBps"
  | "SetMaxPayoutChunk"
  | "AddPhase"
  | "AddMatch"
  | "SetQuorum"
  | "SetVotingPeriod";

type Method = "CreateProposal";

type ProposalKindForm =
  | { type: "SetFeeBps"; new_fee_bps: string }
  | { type: "SetFinalPrizeBps"; new_final_prize_bps: string }
  | { type: "SetMaxPayoutChunk"; new_max_payout_chunk: string }
  | { type: "AddPhase"; name: string; start_time: string; end_time: string }
  | { type: "AddMatch"; phase: string; home: string; away: string; kick_off: string }
  | { type: "SetQuorum"; new_quorum_bps: string }
  | { type: "SetVotingPeriod"; new_voting_period: string };

/* ---------- STYLES (full width, congruent con panel) ---------- */
const spin = keyframes`to { transform: rotate(360deg); }`;
const floatIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

/**
 * Ocupar todo el ancho del contenedor del panel.
 * El panel padre (gov__container) ya limita a 1180px.
 */
const Container = styled.section`
  width: 100%;
  margin: 0;
  padding: 0;
  animation: ${floatIn} 220ms ease-out;
`;

/**
 * Card grande tipo “panel glass”, igual que el resto del dashboard.
 */
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

/* Form card interno */
const Form = styled.div`
  margin-top: 12px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(23, 0, 12, 0.50);
  border: 1px solid rgba(255, 0, 110, 0.14);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

/**
 * Grid más ancho, más “dashboard”:
 * - Desktop: 220px label + contenido
 * - Mobile: 1 columna
 */
const Grid = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 10px 14px;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 650;
  color: rgba(255, 255, 255, 0.88);
  letter-spacing: 0.01em;
  user-select: none;
  padding-top: 10px;

  @media (max-width: 860px) {
    padding-top: 0;
  }
`;

const controlCss = `
  width: 100%;
  min-width: 0;
  border-radius: 14px;
  border: 1px solid rgba(255, 0, 110, 0.18);
  background: rgba(36, 0, 22, 0.45);
  color: rgba(255, 255, 255, 0.95);
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
  transition: border-color 140ms ease-out, box-shadow 140ms ease-out;

  &::placeholder { color: rgba(255, 255, 255, 0.45); }

  &:focus {
    border-color: rgba(255, 0, 110, 0.55);
    box-shadow: 0 0 0 3px rgba(255, 0, 110, 0.18);
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const Input = styled.input`
  ${controlCss}
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
`;

const Select = styled.select`
  ${controlCss}
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;

  background-image:
    linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.65) 50%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.65) 50%, transparent 50%);
  background-position: calc(100% - 18px) calc(50% - 2px), calc(100% - 12px) calc(50% - 2px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
`;

const Textarea = styled.textarea`
  ${controlCss}
  min-height: 110px;
  resize: vertical;
  line-height: 1.35;
`;

const Helper = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
`;

const Hint = styled.span`
  color: rgba(255, 255, 255, 0.62);
`;

const Counter = styled.span`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  color: rgba(255, 255, 255, 0.75);
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 0, 110, 0.14);
  margin-top: 4px;
  padding-top: 12px;
`;

const Button = styled.button<{ disabled?: boolean }>`
  position: relative;
  border: 1px solid rgba(255, 0, 110, 0.35);
  background: linear-gradient(180deg, rgba(255, 0, 110, 0.30), rgba(255, 79, 156, 0.18));
  color: rgba(255, 255, 255, 0.96);
  border-radius: 14px;
  padding: 10px 14px;
  font-weight: 750;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.28);
  transition: transform 110ms ease-out, filter 140ms ease-out, opacity 140ms ease-out;

  &:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  &:active {
    transform: translateY(0px);
  }

  ${({ disabled }) =>
    disabled &&
    `
      opacity: 0.55;
      cursor: not-allowed;
      transform: none !important;
      filter: none !important;
    `}
`;

const Spinner = styled.div`
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.85s linear infinite;
`;

/* ---------- MAIN COMPONENT ---------- */
export const CreateProposalComponent: React.FC = () => {
  const { account } = useAccount();
  const toast = useToast();
  const { api, isApiReady } = useApi();

  const [loading, setLoading] = useState<Method | null>(null);
  const [kind, setKind] = useState<Kind>("SetFeeBps");
  const [form, setForm] = useState<ProposalKindForm>({ type: "SetFeeBps", new_fee_bps: "" });
  const [desc, setDesc] = useState("");

  useEffect(() => {
    void web3Enable("DAO Proposal dApp");
  }, []);

  useEffect(() => {
    switch (kind) {
      case "SetFeeBps":
        setForm({ type: "SetFeeBps", new_fee_bps: "" });
        break;
      case "SetFinalPrizeBps":
        setForm({ type: "SetFinalPrizeBps", new_final_prize_bps: "" });
        break;
      case "SetMaxPayoutChunk":
        setForm({ type: "SetMaxPayoutChunk", new_max_payout_chunk: "" });
        break;
      case "AddPhase":
        setForm({ type: "AddPhase", name: "", start_time: "", end_time: "" });
        break;
      case "AddMatch":
        setForm({ type: "AddMatch", phase: "", home: "", away: "", kick_off: "" });
        break;
      case "SetQuorum":
        setForm({ type: "SetQuorum", new_quorum_bps: "" });
        break;
      case "SetVotingPeriod":
        setForm({ type: "SetVotingPeriod", new_voting_period: "" });
        break;
    }
  }, [kind]);

  const buildProposalKind = (): ProposalKind => {
    switch (form.type) {
      case "SetFeeBps":
        return { SetFeeBps: { new_fee_bps: form.new_fee_bps?.trim() ? form.new_fee_bps.trim() : "0" } };

      case "SetFinalPrizeBps":
        return {
          SetFinalPrizeBps: {
            new_final_prize_bps: form.new_final_prize_bps?.trim() ? form.new_final_prize_bps.trim() : "0",
          },
        };

      case "SetMaxPayoutChunk":
        return {
          SetMaxPayoutChunk: {
            new_max_payout_chunk: form.new_max_payout_chunk?.trim() ? form.new_max_payout_chunk.trim() : "0",
          },
        };

      case "AddPhase":
        return {
          AddPhase: {
            name: form.name,
            start_time: form.start_time?.trim() ? form.start_time.trim() : "0",
            end_time: form.end_time?.trim() ? form.end_time.trim() : "0",
          },
        };

      case "AddMatch":
        return {
          AddMatch: {
            phase: form.phase,
            home: form.home,
            away: form.away,
            kick_off: form.kick_off?.trim() ? form.kick_off.trim() : "0",
          },
        };

      case "SetQuorum":
        return { SetQuorum: { new_quorum_bps: form.new_quorum_bps?.trim() ? Number(form.new_quorum_bps.trim()) : 0 } };

      case "SetVotingPeriod":
        return {
          SetVotingPeriod: { new_voting_period: form.new_voting_period?.trim() ? form.new_voting_period.trim() : "0" },
        };
    }
  };

  const canSubmit = (() => {
    if (!desc.trim()) return false;
    switch (form.type) {
      case "SetFeeBps":
        return form.new_fee_bps && /^\d+$/.test(form.new_fee_bps);
      case "SetFinalPrizeBps":
        return form.new_final_prize_bps && /^\d+$/.test(form.new_final_prize_bps);
      case "SetMaxPayoutChunk":
        return form.new_max_payout_chunk && /^\d+$/.test(form.new_max_payout_chunk);
      case "AddPhase":
        return (
          form.name.trim() &&
          form.start_time &&
          /^\d+$/.test(form.start_time) &&
          form.end_time &&
          /^\d+$/.test(form.end_time)
        );
      case "AddMatch":
        return (
          form.phase.trim() && form.home.trim() && form.away.trim() && form.kick_off && /^\d+$/.test(form.kick_off)
        );
      case "SetQuorum":
        return form.new_quorum_bps && /^\d+$/.test(form.new_quorum_bps);
      case "SetVotingPeriod":
        return form.new_voting_period && /^\d+$/.test(form.new_voting_period);
      default:
        return false;
    }
  })();

  const sendTransaction = useCallback(
    async (tx: TransactionBuilder<unknown>, m: Method) => {
      try {
        const { signer } = await web3FromSource(account!.meta.source);
        tx.withAccount(account!.decodedAddress, { signer });

        await tx.calculateGas();
        const { blockHash, response } = await tx.signAndSend();

        toast.info(`Included in block ${blockHash}`);
        await response();
        toast.success("Proposal created!");
      } catch (err) {
        console.error(err);
        toast.error("Proposal creation failed");
      } finally {
        setLoading(null);
      }
    },
    [account, toast]
  );

  const handleCreate = async () => {
    if (!account) return toast.error("Connect your wallet first");
    if (!isApiReady) return toast.error("Node API not ready");

    const svc = new Service(new Program(api, PROGRAM_ID));
    try {
      const tx = svc.createProposal(buildProposalKind(), desc.trim());
      setLoading("CreateProposal");
      await sendTransaction(tx, "CreateProposal");
      setDesc("");
      // reset fields
      setKind("SetFeeBps");
    } catch (err) {
      console.error(err);
      toast.error("Failed to build proposal transaction");
      setLoading(null);
    }
  };

  const renderKindFields = () => {
    switch (form.type) {
      case "SetFeeBps":
        return (
          <>
            <Label>New Fee (BPS)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 500 (5%)"
              value={form.new_fee_bps}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_fee_bps: e.target.value })}
            />
          </>
        );

      case "SetFinalPrizeBps":
        return (
          <>
            <Label>Final Prize (BPS)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 2000 (20%)"
              value={form.new_final_prize_bps}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_final_prize_bps: e.target.value })}
            />
          </>
        );

      case "SetMaxPayoutChunk":
        return (
          <>
            <Label>Max Payout Chunk</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 10000000000000"
              value={form.new_max_payout_chunk}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_max_payout_chunk: e.target.value })}
            />
          </>
        );

      case "AddPhase":
        return (
          <>
            <Label>Phase Name</Label>
            <Input
              type="text"
              placeholder="e.g. Group Stage"
              value={form.name}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Label>Start Time (epoch s)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 1730000000"
              value={form.start_time}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />

            <Label>End Time (epoch s)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 1730600000"
              value={form.end_time}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </>
        );

      case "AddMatch":
        return (
          <>
            <Label>Phase</Label>
            <Input
              type="text"
              placeholder="e.g. Group Stage"
              value={form.phase}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, phase: e.target.value })}
            />

            <Label>Home Team</Label>
            <Input
              type="text"
              placeholder="e.g. México"
              value={form.home}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, home: e.target.value })}
            />

            <Label>Away Team</Label>
            <Input
              type="text"
              placeholder="e.g. Brasil"
              value={form.away}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, away: e.target.value })}
            />

            <Label>Kickoff Time (epoch s)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 1730050000"
              value={form.kick_off}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, kick_off: e.target.value })}
            />
          </>
        );

      case "SetQuorum":
        return (
          <>
            <Label>Quorum (BPS)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 2000 (20%)"
              value={form.new_quorum_bps}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_quorum_bps: e.target.value })}
            />
          </>
        );

      case "SetVotingPeriod":
        return (
          <>
            <Label>Voting Period (seconds)</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 86400"
              value={form.new_voting_period}
              disabled={loading !== null}
              onChange={(e) => setForm({ ...form, new_voting_period: e.target.value })}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Container>
      <Card>
        <Header>
          <Brand>
            <TitleWrap>
              <Title>New Proposal</Title>
              <Subtitle>Submit a change for the DAO to vote and execute on-chain.</Subtitle>
            </TitleWrap>
          </Brand>

          <MetaPill>DAO</MetaPill>
        </Header>

        <Form>
          <Grid>
            <Label>Proposal Kind</Label>
            <Select value={kind} disabled={loading !== null} onChange={(e) => setKind(e.target.value as Kind)}>
              {PROPOSAL_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>

            {renderKindFields()}

            <Label>Description</Label>
            <div>
              <Textarea
                rows={4}
                placeholder="Explain what you want to change and why it benefits the protocol…"
                value={desc}
                disabled={loading !== null}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={600}
              />
              <Helper>
                <Hint>Tip: include numbers + rationale.</Hint>
                <Counter>{desc.length}/600</Counter>
              </Helper>
            </div>
          </Grid>

          <Actions>
            <Button disabled={loading !== null || !canSubmit} onClick={handleCreate}>
              {loading ? <Spinner /> : null}
              Create Proposal
            </Button>
          </Actions>
        </Form>
      </Card>
    </Container>
  );
};
