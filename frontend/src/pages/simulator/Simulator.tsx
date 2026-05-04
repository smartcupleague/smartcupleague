import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useAccount } from '@gear-js/react-hooks';
import { web3Enable } from '@polkadot/extension-dapp';

import { RegisterPhaseComponent } from './RegisterPhase';
import { RegisterMatchComponent } from './RegisterMatch';
import { ProposeResultComponent } from './ProposeResult';
import { FinalizeResultContainer } from './FinalizeResult';
import { PrepareSettlementComponent } from './PrepareSettlement';
import { StyledWallet } from '@/components/wallet/Wallet';

type AdminTab = 'registerPhase' | 'registerMatch' | 'propose' | 'finalize' | 'settlement';

const Page = styled.div`
  width: 100%;
  max-width: 1580px;
  margin: 0 auto;
  padding: 18px 16px 22px;
  display: grid;
  gap: 14px;
`;

const Panel = styled.section`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: radial-gradient(900px 260px at 18% 0%, rgba(255, 0, 110, 0.12), transparent 60%), rgba(0, 0, 0, 0.12);
  backdrop-filter: var(--blur);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
  overflow: hidden;
`;

const PanelHead = styled.header`
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 920px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;

  .title {
    margin: 0;
    font-size: 18px;
    font-weight: 950;
    color: rgba(255, 255, 255, 0.93);
    letter-spacing: 0.2px;
  }

  .sub {
    margin-top: 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.35;
  }
`;

const HeadRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;

  @media (max-width: 920px) {
    justify-content: flex-start;
  }
`;

const TabsBar = styled.nav`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? 'rgba(255,0,110,.45)' : 'rgba(255,255,255,.12)')};
  background: ${({ $active }) =>
    $active
      ? 'radial-gradient(520px 140px at 20% 20%, rgba(255,0,110,.20), transparent 62%), rgba(0,0,0,.10)'
      : 'rgba(0,0,0,.10)'};
  color: rgba(255, 255, 255, 0.9);
  padding: 10px 12px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 900;
  font-size: 13px;
  transition:
    transform 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
  }
`;

const IconDot = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.14);
`;

const WalletChip = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.12);

  .badge {
    width: 26px;
    height: 26px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
    margin-left: 8px;
    padding-left: 10px;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
  }

  @media (max-width: 520px) {
    width: 100%;
    justify-content: space-between;

    .mono {
      margin-left: 0;
      padding-left: 0;
      border-left: none;
    }
  }
`;

const PanelBody = styled.div`
  padding: 14px;
`;

const ContentCard = styled.div`
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const ContentHead = styled.div`
  padding: 12px 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;

  @media (max-width: 900px) {
    flex-direction: column;
    align-items: flex-start;
  }

  h3 {
    margin: 0;
    font-weight: 950;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.92);
  }

  .muted {
    margin-top: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 12px;
    line-height: 1.35;
  }
`;

const ContentBody = styled.div`
  padding: 12px;
  display: grid;
  justify-items: stretch;

  & > * {
    width: 100%;
  }
`;

export function Simulator() {
  const { account } = useAccount();
  const [tab, setTab] = useState<AdminTab>('registerPhase');

  useEffect(() => {
    void web3Enable('Bolao Admin Console');
  }, []);

  const walletLabel = useMemo(() => {
    const addr = account?.decodedAddress;
    if (!addr) return '—';
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }, [account?.decodedAddress]);

  const headerMeta = useMemo(() => {
    switch (tab) {
      case 'registerPhase':
        return {
          title: 'Register Phase',
          sub: 'Step 1 — Create tournament phases (time window + points weight).',
        };
      case 'registerMatch':
        return {
          title: 'Register Match',
          sub: 'Step 2 — Create matches and attach them to a phase.',
        };
      case 'propose':
        return {
          title: 'Propose Results',
          sub: 'Step 3 — Oracle proposes the final score (and penalties if needed).',
        };
      case 'finalize':
        return {
          title: 'Finalize Results',
          sub: 'Step 4 — Admin finalizes the proposed result on-chain.',
        };
      case 'settlement':
        return {
          title: 'Prepare Settlement',
          sub: 'Step 5 — Admin prepares match settlement (computes total_winner_stake). Required before users can claim.',
        };
      default:
        return { title: 'Admin Console', sub: 'Tools for the SmartCup contract.' };
    }
  }, [tab]);

  return (
    <Page>
      <Panel>
        <PanelHead>
          <TitleBlock>
            <h1 className="title">Admin Console</h1>
            <div className="sub">Professional toolbox for managing phases, matches, results and settlement.</div>
          </TitleBlock>

          <HeadRight>
            <TabsBar>
              <TabBtn $active={tab === 'registerPhase'} onClick={() => setTab('registerPhase')} type="button">
                <IconDot>🏁</IconDot> Register Phase
              </TabBtn>

              <TabBtn $active={tab === 'registerMatch'} onClick={() => setTab('registerMatch')} type="button">
                <IconDot>🗓️</IconDot> Register Match
              </TabBtn>

              <TabBtn $active={tab === 'propose'} onClick={() => setTab('propose')} type="button">
                <IconDot>🧪</IconDot> Propose
              </TabBtn>

              <TabBtn $active={tab === 'finalize'} onClick={() => setTab('finalize')} type="button">
                <IconDot>✅</IconDot> Finalize
              </TabBtn>

              <TabBtn $active={tab === 'settlement'} onClick={() => setTab('settlement')} type="button">
                <IconDot>🧾</IconDot> Settlement
              </TabBtn>
            </TabsBar>

            <WalletChip>
              <div style={{ flex: 1, minWidth: 220 }}>
                <StyledWallet showHeader={false} />
              </div>
            </WalletChip>
          </HeadRight>
        </PanelHead>

        <PanelBody>
          <ContentCard>
            <ContentHead>
              <div>
                <h3>{headerMeta.title}</h3>
                <div className="muted">{headerMeta.sub}</div>
              </div>
            </ContentHead>

            <ContentBody>
              {tab === 'registerPhase' ? (
                <RegisterPhaseComponent />
              ) : tab === 'registerMatch' ? (
                <RegisterMatchComponent />
              ) : tab === 'propose' ? (
                <ProposeResultComponent />
              ) : tab === 'finalize' ? (
                <FinalizeResultContainer />
              ) : (
                <PrepareSettlementComponent />
              )}
            </ContentBody>
          </ContentCard>
        </PanelBody>
      </Panel>
    </Page>
  );
}
