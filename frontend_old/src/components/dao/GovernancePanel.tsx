import React, { useState } from 'react';
import './GovernancePanel.css';
import Overview from './Overview';
import { AllProposals } from './AllProposals';
import { CreateProposalComponent } from './CreateProposal';
import { MyProposals } from './MyProposals';
import { Wallet } from '@gear-js/wallet-connect';

export type TabKey = 'Overview' | 'New Proposal' | 'All Proposals' | 'My Proposals';

export default function GovernancePanel() {
  const [activeTab, setActiveTab] = useState<TabKey>('Overview');

  return (
    <div>
      <div className="gov__bgGlow" />
      <div className="gov__container">
        <header className="gov__top">
          <div className="gov__titleWrap">
            <div className="gov__title">Governance</div>
            <div className="gov__subtitle">
              Shape the future of the protocol. Create proposals, vote on governance decisions, and review activity.
            </div>
          </div>

          <div className="gov__topRight">
            <div className="gov__searchTop">
              <span className="gov__icon">⌕</span>
              <input className="gov__input" placeholder="Search teams, match ID, date..." />
            </div>

            <div className="gov__pill">
              <span className="gov__pillDot" />
            </div>

            <Wallet />
          </div>
        </header>

        <div className="gov__tabsRow">
          <nav className="gov__tabs" aria-label="Governance tabs">
            {(['Overview', 'New Proposal', 'All Proposals', 'My Proposals'] as TabKey[]).map((t) => (
              <button
                key={t}
                className={`gov__tab ${activeTab === t ? 'is-active' : ''}`}
                onClick={() => setActiveTab(t)}
                type="button">
                {t}
              </button>
            ))}
          </nav>

          <button className="gov__cta" type="button" onClick={() => setActiveTab('New Proposal')}>
            <span className="gov__ctaPlus">＋</span>
            New Proposal
          </button>
        </div>

        {activeTab === 'Overview' && <Overview />}

        {activeTab === 'All Proposals' && <AllProposals />}

        {activeTab === 'New Proposal' && <CreateProposalComponent />}

        {activeTab === 'My Proposals' && <MyProposals />}

      </div>
    </div>
  );
}
