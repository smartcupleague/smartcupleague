import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import './legal.css';

export default function TermsOfUse() {
  const navigate = useNavigate();

  return (
    <div className="legal-page">
      <header className="legal-header">
        <button className="legal-back" onClick={() => navigate(-1)} type="button">
          ← Back
        </button>
        <img src="/Logos.png" alt="SmartCup League" className="legal-logo" />
      </header>

      <main className="legal-content">
        <div className="legal-badge">DRAFT</div>
        <h1 className="legal-title">SMARTCUP LEAGUE 2026 — TERMS OF USE (DRAFT)</h1>
        <p className="legal-updated">Last updated: March 2026 — Subject to change before mainnet</p>

        <section className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By connecting your wallet and participating in SmartCup League predictions, you agree to be
            bound by these Terms of Use. If you do not agree to all the terms, you must not access or use the platform.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Eligibility</h2>
          <p>
            You must be at least 18 years of age to participate in SmartCup League. By using the platform,
            you represent and warrant that you meet this requirement and that your use of the platform
            is legal in your jurisdiction.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Nature of the Platform</h2>
          <p>
            SmartCup League is a decentralized, on-chain prediction platform built on the Vara Network.
            All predictions, rewards, and governance actions are executed via smart contracts. The platform
            operates in a non-custodial manner — your assets remain under your control at all times.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Predictions and Pools</h2>
          <p>
            Predictions are settled on-chain based on oracle-verified match results. A portion of each
            prediction contributes to the match prize pool (85%), the final prize pool (10%), and the
            DAO treasury (5%). These parameters may be modified by DAO governance.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Risks</h2>
          <p>
            Participation in on-chain prediction markets involves risk, including but not limited to
            smart contract risk, oracle risk, market volatility, and regulatory risk. You acknowledge
            that you are participating at your own risk and that SmartCup League does not guarantee any returns.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Prohibited Activities</h2>
          <p>
            You agree not to use the platform for any unlawful purpose, including but not limited to
            money laundering, market manipulation, or circumventing applicable laws and regulations.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Intellectual Property</h2>
          <p>
            All content, logos, and materials on SmartCup League are the property of SmartCupDAO or
            its licensors. You may not reproduce or distribute any content without prior written consent.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Governance</h2>
          <p>
            The platform is governed by SmartCupDAO. Token holders may propose and vote on protocol
            parameters, fee structures, and other governance matters as described in the DAO Constitution.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Disclaimer of Warranties</h2>
          <p>
            The platform is provided "as is" without warranty of any kind. SmartCupDAO expressly
            disclaims all warranties, whether express or implied, including but not limited to
            implied warranties of merchantability and fitness for a particular purpose.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by applicable law, SmartCupDAO shall not be liable for
            any indirect, incidental, special, consequential, or punitive damages arising from your
            use of the platform.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Changes to Terms</h2>
          <p>
            SmartCupDAO reserves the right to modify these Terms at any time. Changes will be announced
            via the platform and governance channels. Continued use of the platform after changes
            constitutes your acceptance of the new Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Contact</h2>
          <p>
            For questions about these Terms, please reach out via the official SmartCup League
            community channels (Discord, governance forum).
          </p>
        </section>

        <div className="legal-draft-notice">
          ⚠️ This document is a draft and has not been finalized. It is provided for informational
          purposes prior to the mainnet launch of SmartCup League.
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
