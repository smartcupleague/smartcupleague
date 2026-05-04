import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import './legal.css';

export default function DaoConstitution() {
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
        <div className="legal-badge">VERSION 1.0</div>
        <h1 className="legal-title">SMARTCUPDAO CONSTITUTION</h1>
        <p className="legal-updated">
          Version 1.0 — Adopted by Genesis Contributors
          <br />
          Last Updated: 08/03/2026
          <br />
          No governing jurisdiction selected — designed for neutral international decentralized governance.
        </p>

        <section className="legal-section">
          <h2>Preamble</h2>
          <p>
            SmartCupDAO (“the DAO”) is a decentralized, autonomous governance collective dedicated to
            the long-term stewardship, safety, maintenance, and evolution of the SmartCup League
            Protocol (“the Protocol”). The Protocol powers non-custodial, AMM-based prediction and
            pari-mutuel mechanisms for SmartCup League 2026 and future competitive prediction tournaments.
          </p>
          <p>This Constitution establishes:</p>
          <ul>
            <li>the rights and responsibilities of governance participants (“Members”)</li>
            <li>the structure and authority of the DAO</li>
            <li>membership, whitelist, and share mechanics</li>
            <li>the proposal and voting framework</li>
            <li>treasury and funding procedures</li>
            <li>decentralization guarantees</li>
            <li>operational standards and emergency protections</li>
            <li>regulatory-safe limitations on DAO authority</li>
            <li>the long-term sustainability of the Protocol</li>
          </ul>
          <p>
            The DAO operates under strict non-custodial principles: it cannot hold user funds, cannot
            settle outcomes, cannot set odds, cannot act as a betting operator, and cannot intervene
            in Protocol execution. All user interactions occur directly with autonomous smart contracts.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article 1 — Definitions</h2>

          <h3>1.1 “Protocol”</h3>
          <p>
            The SmartCup League suite of autonomous smart contracts deployed on supported blockchain
            networks, governing:
          </p>
          <ul>
            <li>match prediction pools</li>
            <li>AMM-based pricing logic</li>
            <li>scoring algorithms</li>
            <li>final leaderboard pools</li>
            <li>prize distribution</li>
            <li>fee routing</li>
            <li>oracle ingestion</li>
            <li>governance timelocks</li>
            <li>KYC (age + sanctions only) registry</li>
            <li>lens/helper modules</li>
          </ul>

          <h3>1.2 “DAO”</h3>
          <p>
            The decentralized governance system, composed of Members holding governance shares. The DAO
            may modify certain parameters but never controls user funds.
          </p>

          <h3>1.3 “Foundation”</h3>
          <p>
            A future or existing legal entity that may provide support functions (branding, docs, UI
            maintenance) but does not operate or control the Protocol.
          </p>

          <h3>1.4 “Treasury”</h3>
          <p>
            A non-custodial on-chain account controlled by DAO governance, funded by protocol fees.
            Treasury never receives user stakes or prize pool funds.
          </p>

          <h3>1.5 “Member”</h3>
          <p>
            A Participant who holds governance shares minted by an approved Membership Proposal.
          </p>

          <h3>1.6 “Shares”</h3>
          <p>On-chain governance units used for:</p>
          <ul>
            <li>voting</li>
            <li>treasury claim via RageQuit</li>
            <li>quorum calculation</li>
          </ul>
          <p>
            Shares are not securities, do not guarantee profit, and cannot claim user pool funds.
          </p>

          <h3>1.7 “Proposal”</h3>
          <p>A governance action submitted to the DAO for voting.</p>

          <h3>1.8 “Timelock”</h3>
          <p>Mandatory delay between successful voting and execution.</p>
        </section>

        <section className="legal-section">
          <h2>Article 2 — Purpose of SmartCupDAO</h2>
          <p>
            SmartCupDAO exists as a decentralized governance collective whose sole purpose is to steward
            an autonomous, non-custodial protocol, while remaining structurally neutral with respect to
            user activity, outcomes, and economic risk.
          </p>
          <p>The DAO’s purpose is limited to the following functions and principles:</p>

          <h3>2.1 Stewardship of an Autonomous Protocol</h3>
          <p>
            The DAO exists to steward, protect, and evolve the SmartCup League Protocol as a
            self-executing, autonomous system. Accordingly, the DAO:
          </p>
          <ul>
            <li>does not operate the Protocol</li>
            <li>does not execute user interactions</li>
            <li>does not intervene in settlements</li>
            <li>does not control match outcomes or scoring</li>
            <li>does not custody user funds</li>
          </ul>
          <p>
            All user activity occurs directly with smart contracts, independent of DAO Members or
            Service Providers.
          </p>

          <h3>2.2 Governance of Defined Parameters Only</h3>
          <p>
            The DAO’s authority is strictly limited to governance over predefined, non-critical
            parameters of the Protocol, as enumerated in the Governance Parameter Matrix and enforced by
            on-chain access controls and timelocks.
          </p>
          <ul>
            <li>determines what parameters may change</li>
            <li>determines within what limits they may change</li>
            <li>but does not determine how individual outcomes resolve</li>
          </ul>
          <p>The DAO governs protocol configuration, not execution.</p>

          <h3>2.3 Treasury Stewardship and Scope</h3>
          <p>The DAO maintains a Treasury whose purpose is to fund:</p>
          <ul>
            <li>protocol maintenance and upgrades</li>
            <li>audits and security programs</li>
            <li>oracle services</li>
            <li>developer tooling and infrastructure</li>
            <li>research, documentation, and community initiatives</li>
          </ul>
          <p>The Treasury:</p>
          <ul>
            <li>never holds or custodies user stakes or prize funds</li>
            <li>never distributes match or season prizes</li>
            <li>never acts as a betting counterparty</li>
          </ul>
          <p>
            Subject to governance and the Treasury Policy, the Treasury may support limited,
            non-directional, protocol-controlled liquidity mechanisms whose sole purpose is to improve
            mechanical efficiency of AMM-based pari-mutuel systems.
          </p>
          <p>
            Such support must be non-discretionary, protocol-controlled, must not involve outcome
            prediction or selection, must not expose the DAO to directional risk, and must not transform
            the DAO into a betting operator.
          </p>

          <h3>2.4 Non-Operator and Non-Counterparty Principle</h3>
          <p>The DAO exists as a governance and funding entity only. Under no circumstances shall the DAO:</p>
          <ul>
            <li>act as a betting operator</li>
            <li>act as a bookmaker</li>
            <li>set odds</li>
            <li>take financial exposure to outcomes</li>
            <li>intermediate user funds</li>
            <li>act as a counterparty to users</li>
          </ul>
          <p>
            The DAO’s role is to set boundaries and rules, not to participate in markets governed by
            the Protocol.
          </p>

          <h3>2.5 Service Provider Model</h3>
          <p>
            The DAO may engage independent Service Providers to perform off-chain services that support
            the ecosystem, including but not limited to:
          </p>
          <ul>
            <li>user interface development and maintenance</li>
            <li>infrastructure operation</li>
            <li>documentation and educational materials</li>
            <li>community coordination</li>
            <li>compliance research and advisory services</li>
          </ul>
          <p>Service Providers:</p>
          <ul>
            <li>operate independently</li>
            <li>do not hold governance authority</li>
            <li>do not custody user funds</li>
            <li>do not control Protocol execution</li>
          </ul>

          <h3>2.6 Foundation as a Service Provider</h3>
          <p>
            The Foundation, if approved by governance, may act as a Primary Service Provider for defined
            operational domains.
          </p>
          <ul>
            <li>does not grant governance authority</li>
            <li>does not grant operational control over the Protocol</li>
            <li>does not permit custody of user funds</li>
            <li>does not make the Foundation a Protocol operator or market participant</li>
          </ul>
          <p>The Foundation’s role is limited to off-chain support and implementation.</p>

          <h3>2.7 Implementation Without Operation</h3>
          <p>
            Any implementation of DAO-approved changes by the Foundation or other Service Providers is
            strictly ministerial and mechanical in nature.
          </p>
          <ul>
            <li>follows governance-approved specifications</li>
            <li>occurs without discretion</li>
            <li>does not influence outcomes</li>
            <li>does not modify user fund flows</li>
            <li>does not alter protocol logic beyond approved parameters</li>
          </ul>
          <p>These changes do not imply:</p>
          <ul>
            <li>Protocol operation</li>
            <li>market participation</li>
            <li>outcome control</li>
            <li>custodial activity</li>
          </ul>

          <h3>2.8 Regulatory and Structural Neutrality</h3>
          <p>
            SmartCupDAO is designed to remain structurally neutral across jurisdictions and regulatory
            frameworks. Accordingly, the DAO:
          </p>
          <ul>
            <li>avoids operational roles</li>
            <li>avoids discretionary decision-making</li>
            <li>avoids custody and settlement</li>
            <li>enforces age, sanctions, and geo-restrictions</li>
            <li>preserves front-end neutrality and replaceability</li>
          </ul>

          <h3>2.9 Long-Term Sustainability</h3>
          <p>
            The DAO’s ultimate purpose is to ensure the long-term sustainability, neutrality, and
            credibility of the Protocol through:
          </p>
          <ul>
            <li>transparent governance</li>
            <li>enforceable constraints</li>
            <li>open participation</li>
            <li>the ability for Members to exit at any time via RageQuit</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article 3 — Limitations of DAO Authority</h2>
          <p>The DAO cannot:</p>
          <ul>
            <li>custody user funds</li>
            <li>settle pools manually</li>
            <li>modify match outcomes</li>
            <li>adjust scores or payouts retroactively</li>
            <li>reverse prize distributions</li>
            <li>control escrow contracts</li>
            <li>override oracle results</li>
            <li>set odds or take financial risk</li>
            <li>operate a centralized wagering service</li>
          </ul>
          <p>The DAO governs parameters only, not outcomes or user capital.</p>
        </section>

        <section className="legal-section">
          <h2>Article 4 — Membership & Whitelist (Merit-Based Governance)</h2>

          <h3>4.1 Purpose of Membership</h3>
          <p>
            Membership in SmartCupDAO is merit-based, non-financial, and earned through demonstrated
            participation and performance within the SmartCup League Protocol.
          </p>
          <p>
            The DAO intentionally limits membership to a small, high-signal group of contributors in
            order to:
          </p>
          <ul>
            <li>preserve efficient governance</li>
            <li>prevent dilution and voter apathy</li>
            <li>reduce sybil and governance capture risks</li>
            <li>ensure Members have demonstrated long-term alignment with the Protocol</li>
          </ul>

          <h3>4.2 Whitelist as a Governance Gateway</h3>
          <p>
            The Whitelist is a prerequisite for DAO membership and governance participation. Only
            whitelisted addresses may:
          </p>
          <ul>
            <li>submit Membership Proposals</li>
            <li>receive governance shares</li>
            <li>submit governance or funding proposals</li>
            <li>receive Treasury funding</li>
          </ul>
          <p>
            Whitelist additions are governed by DAO-approved rules and processes and do not
            automatically confer membership.
          </p>

          <h3>4.3 Core Member Eligibility</h3>
          <p>
            An address may be considered eligible for Core Member status if all of the following
            conditions are met:
          </p>
          <p><strong>Leaderboard Performance</strong></p>
          <p>
            The address finishes within the Top 5 positions of an officially recognized SmartCup League
            tournament leaderboard.
          </p>
          <p><strong>Complete Participation Requirement</strong></p>
          <p>The address has:</p>
          <ul>
            <li>submitted predictions for all eligible matches</li>
            <li>
              submitted all required bonus, tournament-wide predictions or other prediction position,
              within the applicable deadlines
            </li>
          </ul>
          <p><strong>Anti-Fraud Review</strong></p>
          <p>
            The address successfully passes a final anti-fraud and integrity review, which may include:
          </p>
          <ul>
            <li>sybil-resistance checks</li>
            <li>duplicate account detection</li>
            <li>automated or manual integrity verification</li>
            <li>compliance with protocol rules and fair-play requirements</li>
          </ul>
          <p><strong>Acceptance of DAO Code of Conduct</strong></p>
          <p>
            The applicant explicitly accepts the DAO Code of Conduct and governance obligations.
          </p>
          <p>
            Meeting eligibility criteria does not automatically grant membership; it enables
            consideration for whitelist approval and membership application.
          </p>

          <h3>4.4 Whitelist Approval for Eligible Candidates</h3>
          <p>
            Addresses that satisfy core member eligibility criteria may be invited to the whitelist
            following verification.
          </p>
          <ul>
            <li>confirms eligibility</li>
            <li>enables submission of a Membership Proposal</li>
            <li>does not itself mint shares or grant voting rights</li>
          </ul>
          <p>
            Whitelist approval may be denied if anti-fraud review fails or if governance determines
            admission would materially harm DAO integrity.
          </p>

          <h3>4.5 Membership Proposal (Core Members)</h3>
          <p>Whitelisted, eligible candidates may submit a Membership Proposal containing:</p>
          <ul>
            <li>applicant address</li>
            <li>supporting details</li>
            <li>quorum requirement</li>
          </ul>
          <p>
            If the Membership Proposal is approved:
          </p>
          <ul>
            <li>governance shares are minted</li>
            <li>the applicant becomes a Core Member of SmartCupDAO with full rights</li>
          </ul>

          <h3>4.6 Rights of Core Members</h3>
          <p>Core Members possess full governance rights, including the right to:</p>
          <ul>
            <li>vote on all proposals</li>
            <li>submit governance, parameter, and funding proposals</li>
            <li>receive governance shares</li>
            <li>receive Treasury funding through approved proposals</li>
            <li>exit the DAO via RageQuit</li>
          </ul>

          <h3>4.7 RageQuit and Exit Rights</h3>
          <p>
            Core Members retain the right to exit the DAO via the RageQuit mechanism, as defined in
            Article 7 (RageQuit — Vara Exit Rights).
          </p>
          <p>
            RageQuit enables Members to burn governance shares in order to exit the DAO and withdraw,
            if any, their proportional claim on the DAO Treasury balance at the time of exit, subject
            to all exclusions and restrictions. No profit, yield, or economic return is guaranteed or
            implied.
          </p>

          <h3>4.8 Membership Caps and Governance Integrity</h3>
          <p>The DAO may, via governance, impose:</p>
          <ul>
            <li>caps on the number of Core Members per tournament</li>
            <li>limits on aggregate share issuance</li>
            <li>additional eligibility or cooling-off requirements</li>
          </ul>
          <p>
            Such measures exist solely to preserve governance quality, decentralization, and long-term
            sustainability.
          </p>

          <h3>4.9 Non-Transferability and Non-Automation</h3>
          <p>Membership:</p>
          <ul>
            <li>is non-transferable</li>
            <li>cannot be sold or delegated</li>
            <li>cannot be automatically granted by smart contracts alone</li>
            <li>always requires governance acknowledgment and approval</li>
          </ul>

          <h3>4.10 No Guaranteed Admission</h3>
          <p>Completion of eligibility criteria does not guarantee:</p>
          <ul>
            <li>whitelist approval</li>
            <li>membership acceptance</li>
            <li>share issuance</li>
          </ul>
          <p>
            The DAO retains final discretion, exercised through transparent governance, to admit
            Members in the best interest of the Protocol.
          </p>

          <h3>4.11 Membership Admission Flow</h3>
          <p>Membership Admission Flow</p>
        </section>

        <section className="legal-section">
          <h2>Article 5 — Governance Process</h2>
          <p>SmartCupDAO uses the Vara Network DAO period architecture.</p>

          <h3>5.1 Periods</h3>
          <p>Governance parameters:</p>
          <ul>
            <li>period_duration — base time unit</li>
            <li>voting_period_length — number of periods proposal is open for voting</li>
            <li>grace_period_length — number of periods Members may RageQuit before execution</li>
          </ul>

          <h3>5.2 Proposal Lifecycle</h3>
          <ul>
            <li>Submission — proposal submitted on-chain</li>
            <li>Voting Period — Members cast votes (Yes/No)</li>
            <li>Grace Period — passed proposals wait; Members may RageQuit</li>
            <li>Processing — proposal executed</li>
            <li>Timelock — enforced delay if parameter changes required</li>
          </ul>

          <h3>5.3 Quorum</h3>
          <p>
            Each proposal defines its own quorum requirement. Proposals failing to meet quorum are invalid.
          </p>

          <h3>5.4 Voting</h3>
          <p>Voting power = Shares held at proposal snapshot.</p>

          <h3>5.5 Execution</h3>
          <p>Any actor may call ProcessProposal(proposal_id) after grace.</p>

          <h3>5.6 Asynchronous Execution</h3>
          <p>
            Where proposals require multi-step operations, any actor may call Continue(tx_id).
          </p>
        </section>

        <section className="legal-section">
          <h2>Article 6 — Funding Proposals</h2>
          <p>Funding Proposals (SubmitFundingProposal) include:</p>
          <ul>
            <li>applicant</li>
            <li>amount</li>
            <li>quorum</li>
            <li>details</li>
          </ul>
          <p>If passed:</p>
          <ul>
            <li>Treasury funds are transferred on-chain</li>
            <li>Execution is transparent</li>
          </ul>
          <p>Funding cannot originate from user pool funds.</p>

          <h3>6.1 Funding Proposal Flow</h3>
          <p>Funding Proposal Flow</p>
        </section>

        <section className="legal-section">
          <h2>Article 7 — RageQuit</h2>

          <h3>7.1 Right to Exit</h3>
          <p>
            Members retain a fundamental, non-revocable right to exit the DAO by invoking the
            RageQuit(shares_amount) mechanism, which permanently burns the specified number of
            governance shares.
          </p>
          <p>
            RageQuit exists solely to protect governance fairness and individual autonomy and shall not
            be interpreted as an economic or investment right.
          </p>

          <h3>7.2 Exit Accounting and Treasury Withdrawal</h3>
          <p>
            Upon invoking RageQuit, a Member may withdraw, if any, a proportional exit accounting
            entitlement to the DAO Treasury balance as it exists at the time of exit, calculated solely
            for the purpose of ensuring fair withdrawal between exiting and remaining Members.
          </p>
          <p>This entitlement:</p>
          <ul>
            <li>does not represent ownership of Treasury assets</li>
            <li>does not entitle the Member to profits, dividends, or future inflows</li>
            <li>may be zero if the Treasury balance is zero or fully committed</li>
            <li>is extinguished immediately upon exit</li>
          </ul>
          <p>
            All user funds, prediction pools, prize mechanisms, and escrowed assets are strictly
            excluded from RageQuit withdrawals.
          </p>

          <h3>7.3 Grace Period Protection</h3>
          <p>
            RageQuit is particularly relevant during the governance grace period, allowing Members who
            disagree with a passed proposal to exit the DAO before that proposal is executed.
          </p>
          <p>
            This mechanism protects minority Members from being compelled to remain subject to
            governance decisions they do not support.
          </p>

          <h3>7.4 Non-Financial Nature</h3>
          <p>
            Governance shares confer participation rights only. They do not constitute equity,
            financial instruments, or claims on Protocol revenue. RageQuit shall never be interpreted
            as a return on participation or a distribution of value.
          </p>

          <h3>7.5 Irrevocability and Finality</h3>
          <p>Once a RageQuit is executed:</p>
          <ul>
            <li>the burned shares cannot be restored</li>
            <li>the exiting Member relinquishes all governance rights</li>
            <li>no further claims against the DAO or Treasury exist</li>
          </ul>

          <h3>7.6 RageQuit Flow</h3>
          <p>RageQuit Flow</p>
        </section>

        <section className="legal-section">
          <h2>Article 8 — Abort Window (Proposer Safety)</h2>
          <p>The proposer may call Abort(proposal_id) within the abort_window.</p>
          <p>If aborted:</p>
          <ul>
            <li>proposal ends immediately</li>
            <li>no shares or funds move</li>
          </ul>
          <p>This prevents flawed or malicious proposals.</p>
        </section>

        <section className="legal-section">
          <h2>Article 9 — Delegate Keys</h2>
          <h3>9.1 Delegation</h3>
          <p>
            Members may assign another address to vote on their behalf using UpdateDelegateKey.
          </p>

          <h3>9.2 Rights</h3>
          <p>Delegation affects only voting power.</p>

          <h3>9.3 Transparency</h3>
          <p>Delegated relationships should be displayed in DAO tooling.</p>
        </section>

        <section className="legal-section">
          <h2>Article 10 — Admin Role</h2>
          <h3>10.1 Definition</h3>
          <p>The DAO contract includes an initial admin set during InitDao.</p>

          <h3>10.2 Authority</h3>
          <p>Admin powers are strictly limited to:</p>
          <ul>
            <li>initialization</li>
            <li>meta-operations</li>
            <li>permitted contract-level maintenance</li>
          </ul>

          <h3>10.3 Transfer</h3>
          <p>Admin may be updated via SetAdmin(new_admin).</p>

          <h3>10.4 Minimization</h3>
          <p>DAO shall progressively reduce administrative powers and decentralize governance.</p>
        </section>

        <section className="legal-section">
          <h2>Article 11 — Oracle Framework</h2>
          <h3>11.1 Oracle Autonomy</h3>
          <p>Match outcomes are ingested exclusively from external Oracle providers.</p>

          <h3>11.2 DAO Powers</h3>
          <p>DAO may:</p>
          <ul>
            <li>change oracle provider</li>
            <li>adjust oracle parameters</li>
            <li>approve fallback oracles</li>
          </ul>

          <h3>11.3 DAO Restrictions</h3>
          <p>DAO cannot:</p>
          <ul>
            <li>edit match results</li>
            <li>manually settle markets</li>
            <li>override scoring</li>
          </ul>
          <p>Settlement is fully automated.</p>
        </section>

        <section className="legal-section">
          <h2>Article 12 — Treasury</h2>

          <h3>12.1 Sources</h3>
          <p>Treasury receives:</p>
          <ul>
            <li>protocol fees</li>
            <li>tribute</li>
            <li>grants</li>
            <li>voluntary contributions</li>
            <li>advertisements</li>
          </ul>

          <h3>12.2 Restrictions</h3>
          <p>Treasury may not:</p>
          <ul>
            <li>hold or custody user stakes or prize pool funds</li>
            <li>directly or indirectly distribute match or season prizes</li>
            <li>act as a betting counterparty</li>
            <li>take discretionary or directional exposure to match outcomes</li>
            <li>finance or operate centralized betting or wagering services</li>
            <li>exercise manual control over AMM pricing or settlement</li>
          </ul>
          <p>
            Treasury assets may be used only in accordance with the Treasury Policy, including approved
            non-directional, protocol-controlled liquidity support mechanisms.
          </p>

          <h3>12.3 Spending</h3>
          <p>Treasury may fund:</p>
          <ul>
            <li>audits</li>
            <li>oracle services</li>
            <li>tooling</li>
            <li>developer grants</li>
            <li>UI improvements</li>
            <li>security programs</li>
            <li>documentation</li>
            <li>operations</li>
          </ul>

          <h3>12.4 Execution</h3>
          <p>All treasury actions require:</p>
          <ul>
            <li>proposal</li>
            <li>vote</li>
            <li>timelock</li>
            <li>multisig execution</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article 13 — Service Provider & Foundation Role</h2>

          <h3>13.1 Engagement Model</h3>
          <p>
            SmartCupDAO may engage one or more Service Providers via governance-approved funding
            proposals to perform off-chain services that support the ecosystem.
          </p>

          <h3>13.2 Foundation as Service Provider</h3>
          <p>
            The foundation, if approved by governance, may act as a Primary Service Provider for defined
            operation domains.
          </p>
          <ul>
            <li>does not confer governance authority</li>
            <li>does not grant control over Protocol execution</li>
            <li>does not permit custody of user funds</li>
            <li>does not make the Foundation a Protocol operator</li>
          </ul>

          <h3>13.3 Ministerial Implementation</h3>
          <p>
            Implementation of DAO-approved changes by any Service Provider is strictly ministerial and
            mechanical in nature and shall not be seen as operational control, discretionary authority,
            or Protocol operation.
          </p>

          <h3>13.4 Non-Exclusivity</h3>
          <p>
            No Service Provider relationship is exclusive. The DAO may replace, supplement, or
            terminate any Service Provider via governance at any time.
          </p>

          <h3>13.5 Separation of Liability</h3>
          <p>
            Service Providers act as independent contractors and do not bind the DAO, its Members, or
            the Protocol to any off-chain obligations.
          </p>
        </section>

        <section className="legal-section">
          <h2>Article 14 — Immutable Components</h2>
          <p>These components are permanently immutable:</p>
          <ul>
            <li>historical scoring logic</li>
            <li>match & final pool logic</li>
            <li>distributor logic</li>
            <li>KYC registry logic</li>
            <li>any user-funds escrow logic</li>
          </ul>
          <p>These contracts may never include:</p>
          <ul>
            <li>withdraw functions for DAO</li>
            <li>admin override functions</li>
            <li>private-key access</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article 15 — Semi-Mutable Components</h2>
          <p>Adjustable only via governance and timelock:</p>
          <ul>
            <li>scoring rules for future matches</li>
            <li>protocol fees</li>
            <li>oracle addresses</li>
            <li>emergency parameters</li>
            <li>UI routing fees</li>
            <li>future chain deployments</li>
            <li>DAO reward parameters</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article 16 — Decentralization Requirements</h2>
          <p>DAO commits to:</p>
          <ul>
            <li>non-custodial architecture</li>
            <li>independently accessible contracts</li>
            <li>open-source code</li>
            <li>permissionless interaction (except geo-block/sanctions/age)</li>
            <li>neutral UI architecture</li>
            <li>transparent governance</li>
            <li>front-end neutrality and replaceability (no mandatory UI or exclusive access path)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article 17 — Sanctions, Age, and Geo-Restrictions</h2>
          <p>DAO enforces:</p>
          <ul>
            <li>18+ age requirement</li>
            <li>sanctions screening</li>
            <li>geo-blocking of restricted jurisdictions</li>
            <li>no targeting of prohibited markets</li>
          </ul>
          <p>DAO may never weaken protections.</p>
        </section>

        <section className="legal-section">
          <h2>Article 18 — Liability</h2>
          <p>SmartCupDAO, Members, and contributors are not liable for:</p>
          <ul>
            <li>smart contract risk</li>
            <li>oracle errors</li>
            <li>blockchain failures</li>
            <li>user mistakes</li>
            <li>regulatory changes</li>
            <li>force majeure</li>
          </ul>
          <p>Use of the Protocol is at the user’s own risk.</p>
        </section>

        <section className="legal-section">
          <h2>Article 19 — Amendments</h2>
          <p>The Constitution may be amended only by:</p>
          <ul>
            <li>governance proposal</li>
            <li>vote</li>
            <li>timelock</li>
          </ul>
          <p>Amendments cannot violate:</p>
          <ul>
            <li>non-custodial structure</li>
            <li>immutability guarantees</li>
            <li>regulatory-safe limits</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Article 20 — Dissolution</h2>
          <p>The DAO may dissolve only by:</p>
          <ul>
            <li>supermajority vote (67%+)</li>
            <li>timelock confirmation</li>
            <li>treasury disbursement plan</li>
          </ul>
          <p>The Protocol remains autonomous and cannot be shut down.</p>
        </section>

        <div className="legal-draft-notice">
          This Constitution reflects Version 1.0 adopted by Genesis Contributors and is presented as
          the governing constitutional text for SmartCupDAO.
        </div>
      </main>

      <AppFooter />
    </div>
  );
}