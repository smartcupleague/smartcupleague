import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import './legal.css';

type LegalSubsection = {
  title: string;
  body?: string[];
  bullets?: string[];
};

type LegalSection = {
  title: string;
  body?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
};

const noticeBullets = [
  'the Interface is distinct from the Protocol;',
  'the Protocol consists of autonomous blockchain-based smart contracts;',
  'the Protocol is non-custodial and permissionless;',
  'no entity or individual controls participant funds or acts as a bookmaker or betting counterparty;',
  'rewards are distributed according to transparent, Protocol-defined competition logic;',
  'participation involves substantial technological, financial, and regulatory risks;',
  'you are solely responsible for ensuring that your use of the Interface and Protocol is lawful in your jurisdiction.',
];

const termsSections: LegalSection[] = [
  {
    title: '1. Eligibility and Legal Compliance',
    subsections: [
      {
        title: '1.1 Minimum Age Requirement',
        body: [
          'You must be at least eighteen (18) years old, or the minimum legal age required in your jurisdiction to access and use the Interface or Protocol, whichever is higher.',
          'By accessing or using the Interface or Protocol, you represent and warrant that you satisfy all applicable age requirements under the laws of your jurisdiction.',
        ],
      },
      {
        title: '1.2 Restricted Persons',
        body: ['You may not access or use the Interface or Protocol if you are:'],
        bullets: [
          'subject to sanctions or restrictive measures administered or enforced by any governmental or international authority, including OFAC, the European Union, the United Nations, or the UK HM Treasury;',
          'acting on behalf of a sanctioned person or entity;',
          'otherwise prohibited from participating under applicable law.',
        ],
      },
      {
        title: '1.3 Restricted Jurisdictions',
        body: [
          'You may not access, use, or interact with the Interface or Protocol if your jurisdiction prohibits or restricts blockchain-based forecasting competitions, digital asset activities, or similar online services.',
          'Restricted jurisdictions may include, without limitation: United States, United Kingdom, Spain, France, Netherlands, Germany, Australia, Singapore, China, North Korea, Iran, Syria, Cuba, Belarus, Myanmar, Russia, Sudan, South Sudan, Afghanistan, Yemen, Venezuela, Iraq, Ontario (Canada), and any other jurisdiction where participation may be restricted or prohibited.',
          'This list is non-exhaustive and may be modified or updated at any time without notice.',
        ],
        bullets: [
          'your participation would violate any applicable law, regulation, or governmental order;',
          'you access the Interface or Protocol from a prohibited jurisdiction.',
        ],
      },
      {
        title: '1.4 Circumvention Prohibited',
        body: [
          'You may not use VPNs, proxies, routing services, or any other method intended to circumvent geographic restrictions, sanctions restrictions, or compliance controls.',
          'The Interface may implement geo-blocking measures, wallet restrictions, sanctions screening, access controls, or other compliance mechanisms at its discretion.',
        ],
      },
      {
        title: '1.5 User Responsibility for Legal Compliance',
        body: [
          'You are solely responsible for determining whether your access to and use of the Interface or Protocol is lawful in your jurisdiction.',
          'Laws relating to blockchain systems, digital assets, online forecasting competitions, gaming activities, financial technologies, and decentralized protocols vary significantly between jurisdictions and may change rapidly.',
          'If you are uncertain whether your participation is lawful in your country, state, province, or territory, you must seek independent legal advice before accessing or using the Interface or Protocol.',
          'By using the Interface or Protocol, you represent and warrant that:',
        ],
        bullets: [
          'your participation is lawful under all laws applicable to you;',
          'you are legally permitted to access and use the Services;',
          'you are acting solely on your own behalf;',
          'you assume full responsibility for all legal, regulatory, financial, and tax consequences associated with your use of the Interface or Protocol.',
        ],
      },
    ],
  },
  {
    title: '2. Nature of the Protocol',
    subsections: [
      {
        title: '2.1 The Interface Is Not the Protocol',
        body: [
          'The Interface is only one possible method of accessing the Protocol.',
          'Users may interact directly with the Protocol using wallets, blockchain explorers, or third-party applications without using the Interface.',
          'The Protocol may continue operating independently even if the Interface becomes unavailable.',
        ],
      },
      {
        title: '2.2 Autonomous and Non-Custodial Infrastructure',
        body: [
          'The Protocol is designed to operate through autonomous smart contracts deployed on blockchain networks.',
          'No contributor, Foundation member, DAO participant, Interface operator, developer, or related party:',
        ],
        bullets: [
          'controls User wallets;',
          'holds User private keys;',
          'approves individual transactions;',
          'reverses blockchain transactions;',
          'manually distributes rewards.',
        ],
      },
      {
        title: '2.3 No Bookmaking or Custodial Gaming Operations',
        body: [
          'The Interface and Protocol are designed as decentralized football forecasting competition infrastructure and not as a custodial sportsbook or betting operator.',
          'The Interface and Protocol:',
        ],
        bullets: [
          'do not offer fixed-odds wagering;',
          'do not act as a bookmaker or betting counterparty;',
          'do not manage participant exposure for profit;',
          'do not guarantee rewards or returns;',
          'do not manually determine competition outcomes or rankings;',
          'do not custody participant Digital Assets.',
        ],
      },
      {
        title: '2.4 Skill-Based Forecasting System',
        body: [
          'The Protocol is structured around predictive football forecasting competitions in which participants:',
        ],
        bullets: [
          'submit football score forecasts;',
          'accumulate ranking points based on predictive accuracy;',
          'compete across multiple matches or tournaments;',
          'may qualify for Protocol-defined reward allocations.',
          'Leaderboard rankings are influenced by predictive performance, consistency, and scoring accuracy.',
        ],
      },
    ],
  },
  {
    title: '3. Definitions',
    subsections: [
      { title: '3.1 Protocol', body: ['The SmartCup League Protocol is a decentralized blockchain-based software system designed to facilitate football forecasting competitions through autonomous smart-contract logic.'] },
      { title: '3.2 Interface', body: ['The front-end software applications and related websites that enable interaction with the Protocol.'] },
      { title: '3.3 User or You', body: ['Any person or entity accessing or interacting with the Interface, Protocol, or Services.'] },
      { title: '3.4 Wallet', body: ['A non-custodial blockchain wallet controlled exclusively by the User and the User private keys.'] },
      { title: '3.5 Digital Assets', body: ['Blockchain-based cryptographic assets used in connection with the Protocol.'] },
      { title: '3.6 Forecasting Competition', body: ['A Protocol-defined competition in which participants submit football score forecasts and may receive ranking points or reward allocations based on predictive accuracy.'] },
      { title: '3.7 Leaderboard', body: ['An on-chain or off-chain ranking system that tracks participant forecasting performance according to Protocol-defined scoring rules.'] },
      { title: '3.8 DAO', body: ['A decentralized governance system that may manage certain Protocol configuration parameters through on-chain governance mechanisms.', 'The DAO does not custody User assets.'] },
      { title: '3.9 Foundation', body: ['A supporting entity that may assist with software development, communications, interface maintenance, documentation, or related off-chain services.', 'The Foundation does not operate the Protocol and does not custody User assets.'] },
      { title: '3.10 Oracle', body: ['A third-party or decentralized data provider responsible for publishing football match data and results to blockchain systems.'] },
    ],
  },
  {
    title: '4. User Responsibility and Self-Custody',
    subsections: [
      {
        title: '4.1 Wallet Responsibility',
        body: ['You retain exclusive control over your Wallet and private keys. You are solely responsible for:'],
        bullets: [
          'securing your Wallet;',
          'maintaining backup credentials;',
          'authorizing transactions;',
          'reviewing all blockchain activity associated with your Wallet.',
          'Loss of private keys may result in permanent loss of access to Digital Assets.',
        ],
      },
      {
        title: '4.2 No Custody',
        body: ['No contributor, Foundation member, DAO participant, or Interface operator has custody or control over User Digital Assets at any time.'],
      },
      {
        title: '4.3 Irreversible Transactions',
        body: ['Blockchain transactions are generally irreversible.', 'Completed transactions cannot typically be canceled, reversed, or recovered.'],
      },
    ],
  },
  {
    title: '5. Forecasting Competition Mechanics',
    subsections: [
      {
        title: '5.1 Protocol-Defined Reward Allocation',
        body: ['The Protocol may automatically allocate portions of participant entries toward:'],
        bullets: [
          'match-specific competition pools;',
          'seasonal or tournament leaderboard reward pools;',
          'Protocol maintenance fees;',
          'governance-defined operational allocations.',
          'All allocations are determined through transparent Protocol logic.',
        ],
      },
      {
        title: '5.2 No Fixed Returns',
        body: ['The Protocol does not guarantee:'],
        bullets: [
          'profits;',
          'rewards;',
          'financial returns;',
          'successful outcomes;',
          'specific reward allocations.',
          'Any reward allocation depends on participant activity, competition outcomes, and Protocol-defined rules.',
        ],
      },
      {
        title: '5.3 Variable Reward Distributions',
        body: ['Reward distributions may vary significantly depending on:'],
        bullets: [
          'the number of participants;',
          'forecasting performance;',
          'scoring outcomes;',
          'pool allocation structures;',
          'governance-defined parameters.',
          'Participants may receive less than the value of their submitted Digital Assets or no reward allocation at all.',
        ],
      },
      {
        title: '5.4 No Treasury Balancing or Market Making',
        body: ['The Protocol does not:'],
        bullets: [
          'inject capital to rebalance outcomes;',
          'guarantee liquidity;',
          'subsidize competition pools;',
          'manage participant exposure for profit.',
          'All participation risk is borne exclusively by Users.',
        ],
      },
    ],
  },
  {
    title: '6. Governance',
    subsections: [
      {
        title: '6.1 DAO Governance',
        body: ['The DAO may adjust certain non-custodial Protocol parameters, including:'],
        bullets: ['scoring weights;', 'reward allocation percentages;', 'Oracle configuration;', 'competition structures;', 'operational parameters.'],
      },
      {
        title: '6.2 Governance Limitations',
        body: ['The DAO cannot:'],
        bullets: ['access User funds;', 'reverse blockchain transactions;', 'modify finalized competition results;', 'retroactively alter settled reward distributions.'],
      },
    ],
  },
  {
    title: '7. Oracles and Data',
    subsections: [
      { title: '7.1 Third-Party Data Sources', body: ['The Protocol may rely on third-party or decentralized Oracle systems for football match data and results.'] },
      {
        title: '7.2 Oracle Risks',
        body: ['Oracle systems may experience:'],
        bullets: ['delays;', 'outages;', 'inaccuracies;', 'corruption;', 'manipulation attempts;', 'technical failures.', 'No guarantee is made regarding Oracle accuracy or availability.'],
      },
      { title: '7.3 No Manual Outcome Manipulation', body: ['No contributor, Foundation member, DAO participant, or Interface operator may manually alter finalized Protocol reward calculations.'] },
    ],
  },
  {
    title: '8. Experimental Technology',
    body: [
      'The Protocol utilizes emerging blockchain technologies and experimental smart-contract systems.',
      'The Protocol may contain bugs, vulnerabilities, security failures, economic design flaws, governance risks, or unexpected technical behavior.',
      'Use of the Protocol is entirely at your own risk.',
    ],
  },
  {
    title: '9. User Risks',
    body: ['By using the Interface or Protocol, you acknowledge and accept that:'],
    bullets: [
      'Digital Assets may lose value;',
      'blockchain systems may fail;',
      'smart contracts may malfunction;',
      'Oracle systems may be inaccurate;',
      'transactions may be delayed or reordered;',
      'gas fees may fluctuate;',
      'regulatory frameworks may change rapidly;',
      'participation may result in partial or total loss of Digital Assets.',
      'You should not participate with an expectation of guaranteed profit, investment return, or financial gain.',
    ],
  },
  {
    title: '10. Regulatory Uncertainty',
    body: [
      'The legal and regulatory treatment of blockchain technologies, decentralized protocols, digital assets, forecasting competitions, and autonomous reward systems remains uncertain in many jurisdictions.',
      'Regulatory authorities may classify or regulate the Protocol differently in the future.',
    ],
  },
  {
    title: '11. Fees and Treasury',
    subsections: [
      {
        title: '11.1 Protocol Fees',
        body: ['The Protocol may automatically collect governance-defined fees associated with participation. Fees may support:'],
        bullets: ['Protocol maintenance;', 'ecosystem development;', 'infrastructure costs;', 'community operations;', 'DAO-controlled initiatives.'],
      },
      {
        title: '11.2 DAO Treasury',
        body: ['The DAO Treasury:'],
        bullets: ['does not custody User assets;', 'receives only Protocol-defined fee allocations;', 'cannot access participant Wallets;', 'operates through governance-controlled smart contracts.'],
      },
    ],
  },
  {
    title: '12. Tax Responsibility',
    body: ['You are solely responsible for:'],
    bullets: ['determining whether taxes apply to your activities;', 'reporting taxable events;', 'calculating gains or losses;', 'complying with all applicable tax obligations.', 'No contributor or related party provides tax advice.'],
  },
  {
    title: '13. No Warranty',
    body: [
      'THE INTERFACE, PROTOCOL, AND SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.',
      'No guarantee is made regarding uptime, availability, accessibility, security, accuracy, or uninterrupted operation.',
    ],
  },
  {
    title: '14. No Financial, Legal, or Investment Advice',
    body: ['Nothing provided through the Interface, Protocol, or Services constitutes:'],
    bullets: ['financial advice;', 'investment advice;', 'legal advice;', 'tax advice;', 'professional advisory services.'],
  },
  {
    title: '15. No Offer or Solicitation',
    body: ['Nothing in the Interface, Protocol, or Services constitutes:'],
    bullets: ['an offer to sell securities;', 'an investment solicitation;', 'a financial product offering;', 'a custodial gaming service;', 'a guarantee of financial return.'],
  },
  {
    title: '16. Limitation of Liability',
    body: ['To the maximum extent permitted by law, no contributor, Foundation member, DAO participant, Interface operator, developer, or related party shall be liable for:'],
    bullets: ['loss of Digital Assets;', 'smart-contract failures;', 'Oracle failures;', 'governance actions;', 'data loss;', 'economic losses;', 'indirect or consequential damages.'],
  },
  {
    title: '17. Indemnification',
    body: ['You agree to indemnify and hold harmless all contributors and related parties from claims arising from:'],
    bullets: ['your use of the Interface or Protocol;', 'your violation of law;', 'your breach of these Terms.'],
  },
  {
    title: '18. Third-Party Services',
    body: [
      'The Interface may integrate with or link to third-party services.',
      'No responsibility is assumed for third-party infrastructure, wallets, APIs, hosting services, blockchain networks, or external providers.',
    ],
  },
  {
    title: '19. Termination and Interface Access',
    body: [
      'Access to the Interface may be restricted, suspended, or terminated at any time.',
      'The Protocol itself may continue operating independently of the Interface.',
    ],
  },
  {
    title: '20. Intellectual Property',
    body: [
      'Interface branding, content, and associated materials may belong to the Foundation or respective licensors.',
      'Open-source Protocol components remain subject to their applicable licenses.',
    ],
  },
  {
    title: '21. No Partnership or Fiduciary Relationship',
    body: ['Your use of the Interface or Protocol does not create:'],
    bullets: ['a partnership;', 'fiduciary relationship;', 'agency relationship;', 'joint venture.'],
  },
  {
    title: '22. Force Majeure',
    body: ['No contributor or related party shall be responsible for delays or failures caused by events beyond reasonable control, including:'],
    bullets: ['blockchain outages;', 'network congestion;', 'cyberattacks;', 'regulatory actions;', 'infrastructure failures.'],
  },
  {
    title: '23. Disputes',
    body: [
      'To the extent permitted by applicable law, parties agree to attempt to resolve disputes arising from these Terms through good-faith discussions before initiating formal legal proceedings.',
      'Additional dispute resolution procedures, governing law provisions, or arbitration frameworks may be adopted or published in the future in connection with the Interface or related off-chain services.',
    ],
  },
  {
    title: '24. Changes to Terms',
    body: [
      'These Terms may be modified or updated at any time.',
      'Continued use of the Interface or Protocol constitutes acceptance of updated Terms.',
    ],
  },
  {
    title: '25. Survival',
    body: ['All disclaimers, limitations of liability, indemnities, and risk disclosures survive termination of access to the Interface or Protocol.'],
  },
  {
    title: '26. Entire Agreement',
    body: [
      'These Terms constitute the entire agreement between you and the providers of the Interface with respect to your access to and use of the Interface, Protocol, and Services, and supersede all prior or contemporaneous communications, understandings, discussions, or agreements, whether oral or written, relating to the subject matter herein.',
      'No statement, representation, or information not expressly contained in these Terms shall be relied upon as creating any warranty, obligation, or contractual relationship with respect to the Interface, Protocol, or Services.',
    ],
  },
];

function Paragraphs({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </>
  );
}

function Bullets({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function LegalSubsectionBlock({ subsection }: { subsection: LegalSubsection }) {
  return (
    <div className="legal-subsection">
      <h3>{subsection.title}</h3>
      <Paragraphs items={subsection.body} />
      <Bullets items={subsection.bullets} />
    </div>
  );
}

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

      <main className="legal-content legal-content--wide">
        <div className="legal-badge">Version 1.0</div>
        <h1 className="legal-title">SmartCup League - Terms of Use</h1>
        <p className="legal-kicker">Decentralized Football Forecasting Competition Protocol</p>
        <p className="legal-updated">Last updated: May 12, 2026</p>

        <section className="legal-notice">
          <h2>Important Notice - Please Read Carefully</h2>
          <p>
            These Terms of Use ("Terms") govern your access to and use of the SmartCup League
            websites, dashboards, applications, front-end interfaces, decentralized smart-contract
            system, blockchain infrastructure, documentation, APIs, analytics, communication
            channels, and support materials.
          </p>
          <p>By accessing the Interface or interacting with the Protocol, you acknowledge and agree that:</p>
          <Bullets items={noticeBullets} />
          <p>
            If you do not agree to these Terms, you must not access or use the Interface, Protocol,
            or Services.
          </p>
        </section>

        {termsSections.map((section) => (
          <section className="legal-section" key={section.title}>
            <h2>{section.title}</h2>
            <Paragraphs items={section.body} />
            <Bullets items={section.bullets} />
            {section.subsections?.map((subsection) => (
              <LegalSubsectionBlock key={subsection.title} subsection={subsection} />
            ))}
          </section>
        ))}
      </main>

      <AppFooter />
    </div>
  );
}
