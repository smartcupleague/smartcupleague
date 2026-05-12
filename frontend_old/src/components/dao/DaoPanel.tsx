import React from 'react';
import { daoProposals, FINAL_PRIZE_POOL_BTC, USER_VOTING_POWER } from './dao';
import './scb-dashboard.css';

export const DaoPanel: React.FC = () => {
  return (
    <aside className="scb-dao-panel">
      <div className="scb-dao-panel__header">
        <div>
          <h2 className="scb-dao-panel__title">DAO & Governance</h2>
          <p className="scb-dao-panel__subtitle">
            Tune BolaoCore parameters and final prize distribution via on-chain voting.
          </p>
        </div>
        <span className="scb-dao-panel__badge">Protocol DAO</span>
      </div>

      <div className="scb-dao-grid">
        <article className="scb-dao-card">
          <h3>Your voting power</h3>
          <p className="scb-dao-power">
            {USER_VOTING_POWER.toLocaleString()} <span className="scb-dao-unit">BOL</span>
          </p>
          <p className="scb-dao-sub">Based on your stake, past participation and delegated voting rights.</p>
          <div className="scb-dao-tags">
            <span className="scb-chip">Active voter</span>
            <span className="scb-chip">Proposal eligible</span>
          </div>
        </article>

        {/* Final prize pool card */}
        <article className="scb-dao-card">
          <h3>Final prize pool</h3>
          <p className="scb-dao-amount">₿ {FINAL_PRIZE_POOL_BTC.toFixed(2)}</p>
          <p className="scb-dao-sub">20% of protocol fees are streamed into this pool across all cups.</p>

          <div className="scb-dao-breakdown">
            <div>
              <span className="scb-label">Included cups</span>
              <p className="scb-value">World Cup, Champions, EURO, Libertadores, more…</p>
            </div>
            <div>
              <span className="scb-label">Next distribution</span>
              <p className="scb-value">World Cup final · 18/12</p>
            </div>
          </div>
        </article>

        {/* Proposals card */}
        <article className="scb-dao-card scb-dao-card--proposals">
          <div className="scb-dao-card__header">
            <h3>Active proposals</h3>
            <span className="scb-dao-count">{daoProposals.length}</span>
          </div>

          <div className="scb-dao-proposals">
            {daoProposals.map((proposal) => (
              <div key={proposal.id} className="scb-proposal">
                <div>
                  <p className="scb-proposal-title">{proposal.title}</p>
                  <p className="scb-proposal-meta">{proposal.meta}</p>
                </div>
                <div className="scb-proposal-vote">
                  <button className="scb-btn scb-btn--ghost scb-btn--xs">Support</button>
                  <button className="scb-btn scb-btn--ghost scb-btn--xs">Reject</button>
                </div>
              </div>
            ))}
          </div>

          <button className="scb-btn scb-btn--primary scb-btn--full scb-btn--sm">Create new proposal</button>
        </article>
      </div>
    </aside>
  );
};
