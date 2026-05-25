import React, { useEffect, useMemo, useState } from 'react';
import { useApi } from '@gear-js/react-hooks';
import { FaInstagram, FaTelegram, FaXTwitter } from 'react-icons/fa6';
import { Link, useNavigate } from 'react-router-dom';
import { Program, Service } from '@/hocs/lib';
import { matchPath } from '@/utils';
import { getTeamFlagSrc } from '@/utils/teams';
import './landing.css';

type Slide = { src: string; alt: string; kicker?: string; title: string; titleLines?: string[]; subtitle: string };
type HighlightMatch = {
  match_id: string;
  phase: string;
  home: string;
  away: string;
  kick_off: number;
  result?: any;
};

const PROGRAM_ID = import.meta.env.VITE_BOLAOCOREPROGRAM as `0x${string}`;

const fallbackHighlights: HighlightMatch[] = [
  { match_id: '1', phase: 'Europe', home: 'Spain', away: 'France', kick_off: 0 },
  { match_id: '2', phase: 'South America', home: 'Argentina', away: 'Uruguay', kick_off: 0 },
  { match_id: '3', phase: 'Global', home: 'England', away: 'Germany', kick_off: 0 },
];

const socialLinks = [
  {
    label: 'X',
    href: 'https://x.com/smartcupleague',
    icon: <FaXTwitter aria-hidden="true" />,
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com/smartcupleague',
    icon: <FaInstagram aria-hidden="true" />,
  },
  {
    label: 'Telegram',
    href: 'https://t.me/smartcupcommunity',
    icon: <FaTelegram aria-hidden="true" />,
  },
];

function kickOffToMs(input: number) {
  if (!input || !Number.isFinite(input)) return 0;
  return input < 10_000_000_000 ? input * 1000 : input;
}

function isFinalized(result: any) {
  return !!(result?.Finalized || result?.finalized);
}

function flagSrc(team: string) {
  return getTeamFlagSrc(team);
}

function teamInitials(team: string) {
  return (team || '?')
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function formatKickoff(ms: number) {
  if (!ms) return 'Next top clash';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { api, isApiReady } = useApi();
  const [highlightMatches, setHighlightMatches] = useState<HighlightMatch[]>(fallbackHighlights);

  const slides: Slide[] = useMemo(
    () => [
      {
        src: '/images/Carrossel01.jpg',
        alt: 'Football stadium lights at night',
        kicker: 'GLOBAL PREDICTION GAME',
        title: 'The Global Football Prediction Game',
        subtitle: 'One platform. Two competitions. Endless matches.',
      },
      {
        src: '/images/Carrossel02.jpg',
        alt: 'Football fans celebrating',
        kicker: 'LIVE TOURNAMENTS',
        title: 'Play the World Cup Like a Pro',
        subtitle: 'Multiplayer predictions. Real rivalry.',
      },
      {
        src: '/images/Carrossel03.jpg',
        alt: 'Football team lineup',
        kicker: 'EASY TO PLAY, EASY TO SETTLE',
        title: 'No friction. No waiting. No complexity.',
        titleLines: ['No friction. No waiting.', 'No complexity.'],
        subtitle: 'Connect your SubWallet and start playing in seconds.',
      },
      {
        src: '/images/Carrossel04.jpg',
        alt: 'Football on the pitch',
        kicker: 'FAIR & PUBLIC',
        title: 'No House. Just Players',
        subtitle: 'No odds setting. No house advantage. No manual control.',
      },
    ],
    [],
  );

  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setActive((i) => (i + 1) % slides.length), 5200);
    return () => window.clearInterval(t);
  }, [paused, slides.length]);

  useEffect(() => {
    if (!api || !isApiReady || !PROGRAM_ID) return;

    let cancelled = false;
    const readyApi = api;

    async function fetchHighlights() {
      try {
        const svc = new Service(new Program(readyApi, PROGRAM_ID));
        const state = (await (svc as any).queryState()) as { matches?: any[] };
        const now = Date.now();
        const upcoming = (Array.isArray(state?.matches) ? state.matches : [])
          .map((m) => ({
            match_id: String(m?.match_id ?? ''),
            phase: String(m?.phase ?? ''),
            home: String(m?.home ?? ''),
            away: String(m?.away ?? ''),
            kick_off: Number(m?.kick_off ?? 0),
            result: m?.result ?? null,
          }))
          .filter((m) => m.match_id && m.home && m.away && kickOffToMs(m.kick_off) > now && !isFinalized(m.result))
          .sort((a, b) => kickOffToMs(a.kick_off) - kickOffToMs(b.kick_off))
          .slice(0, 3);

        if (!cancelled && upcoming.length) setHighlightMatches(upcoming);
      } catch {
        if (!cancelled) setHighlightMatches(fallbackHighlights);
      }
    }

    void fetchHighlights();

    return () => {
      cancelled = true;
    };
  }, [api, isApiReady]);

  const goPrev = () => setActive((i) => (i - 1 + slides.length) % slides.length);
  const goNext = () => setActive((i) => (i + 1) % slides.length);

  return (
    <div className="scb-page">
      <nav className="scb-nav">
        <div className="scb-nav__left">
          <div className="scb-nav__links">
            <a className="scb-brand" href="#top" aria-label="SmartCup League">
              <img className="scb-brand__logo" src="./Logos.png" alt="SmartCupLeague logo" />
            </a>
            <a href="#prediction">Prediction Game</a>
            <a href="#how">How it works</a>
            <a href="#tournaments">Tournaments</a>
            <a href="#why">Why</a>
            <a href="#faq">FAQ</a>
          </div>
        </div>

        <div className="scb-nav__right">
          {/* Language switcher kept for future i18n rollout.
          <div className="scb-lang" aria-label="Language options">
            <button className="scb-lang__btn" type="button" aria-label="English">
              EN
            </button>
            <span className="scb-lang__sep">/</span>
            <button className="scb-lang__btn" type="button" aria-label="Spanish">
              ES
            </button>
            <span className="scb-lang__sep">/</span>
            <button className="scb-lang__btn" type="button" aria-label="Portuguese">
              PT
            </button>
          </div>
          */}

          <button className="scb-btn scb-btn--primary" onClick={() => navigate('/all-matches')}>
            Enter app
          </button>
        </div>
      </nav>

      <main>
        <section
          id="top"
          className="scb-hero-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}>
          <div className="scb-carousel" role="region" aria-label="Hero carousel">
            {slides.map((s, idx) => (
              <div key={s.src} className={`scb-slide scb-slide--${idx + 1} ${idx === active ? 'is-active' : ''}`}>
                <img src={s.src} alt={s.alt} className="scb-slide__img" />
                <div className="scb-slide__gradient" />

                <div className="scb-slide__content">
                  <p className="scb-hero__kicker">{s.kicker ?? 'SMARTCUP LEAGUE'}</p>

                  <h1 className="scb-hero__headline">
                    <span className="scb-hero__headline-main">
                      {s.titleLines ? s.titleLines.map((line) => <span key={line}>{line}</span>) : s.title}
                    </span>
                    <span className="scb-hero__headline-line">{s.subtitle}</span>
                    <span className="scb-hero__headline-line">
                      Soccer prediction markets on the <span className="scb-hero__highlight">blockchain</span>
                    </span>
                  </h1>

                  <div className="scb-hero__cta-row">
                    <button className="scb-btn scb-btn--primary scb-hero__cta" onClick={() => navigate('/all-matches')}>
                      Start predicting
                    </button>
                    <a className="scb-btn scb-btn--ghost" href="#how">
                      Learn how markets work
                    </a>
                  </div>

                  <div className="scb-hero__badges" aria-label="Key benefits">
                    <span className="scb-pill scb-pill--soft">Non-custodial</span>
                    <span className="scb-pill scb-pill--soft">No house edge</span>
                    <span className="scb-pill scb-pill--soft">On-chain settlement</span>
                  </div>
                </div>
              </div>
            ))}

            <button className="scb-carousel__arrow scb-carousel__arrow--left" onClick={goPrev} aria-label="Previous">
              ‹
            </button>
            <button className="scb-carousel__arrow scb-carousel__arrow--right" onClick={goNext} aria-label="Next">
              ›
            </button>

            <div className="scb-carousel__dots" aria-label="Carousel dots">
              {slides.map((_, i) => (
                <button
                  key={i}
                  className={`scb-dot ${i === active ? 'is-active' : ''}`}
                  onClick={() => setActive(i)}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section id="prediction" className="scb-section scb-section--tight scb-section--prediction">
          <header className="scb-section__header scb-section__header--center">
            <h2>What is a sport prediction game?</h2>
            <p>
              SmartCup League is a gamified, on-chain prediction tournament where players compete with each other —
              not against a house. Two games in one: win match-by-match and climb a season-long leaderboard. No
              custody. No manipulation. Full transparency.
            </p>
          </header>

          <div className="scb-grid">
            <div className="scb-feature-card">
              <h3>Odds from the crowd</h3>
              <p>
                Odds are created by the number of participants in each match. All prices emerge from the pool of
                predictions through an Automated Market Maker (AMM).
              </p>
            </div>

            <div className="scb-feature-card">
              <h3>Fully Transparent and Fast Resolution</h3>
              <p>
                Every pool, payout and rankings are visible on-chain. Funds are locked in smart contracts, and prizes
                are settled immediately.
              </p>
            </div>

            <div className="scb-feature-card">
              <h3>Two Games in One</h3>
              <p>
                Every match counts — twice. Win instant rewards and earn points toward a global, season-long
                tournament. Climb the rankings and compete to become the ultimate SmartCup champion.
              </p>
            </div>
          </div>

          <div className="scb-video-band" id="how">
            <div className="scb-video-copy">
              <h3>How It Works</h3>
              <p>Learn how to create your wallet, get VARA, connect, and place your first SmartCup League prediction.</p>
            </div>

            <div className="scb-video">
              <iframe
                src="https://www.youtube.com/embed/2JTLWyvIHug"
                title="How to play SmartCup League"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </section>

        <section className="scb-section scb-section--band">
          <header className="scb-section__header scb-section__header--center scb-band__header">
            <h2>Built for Fair Competition</h2>
            <p>
              SmartCup League keeps prediction pools transparent, automated, and player-driven from the first match to
              the final leaderboard.
            </p>
          </header>

          <div className="scb-band">
            <div className="scb-band__item">
              <p className="scb-band__value">100%</p>
              <p className="scb-band__label">Non-custodial & on-chain</p>
              <p className="scb-band__sub">Smart contracts handle everything — fully automated and transparent</p>
            </div>
            <div className="scb-band__item">
              <p className="scb-band__value">0%</p>
              <p className="scb-band__label">House edge or manual odds</p>
              <p className="scb-band__sub">
                Markets run purely on liquidity and user positions. No intermediaries
              </p>
            </div>
            <div className="scb-band__item">
              <p className="scb-band__value">10%</p>
              <p className="scb-band__label">Flows into the Grand Final Pool</p>
              <p className="scb-band__sub">Every position brings you closer to the league’s top rewards</p>
            </div>
          </div>
        </section>

        <section id="tournaments" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Pick your tournament</h2>
            <p>Global arenas, on-chain rewards. One account for all.</p>
          </header>

          <div className="scb-tournaments">
            <div className="scb-tournament-card">
              <img src="/images/tournament-worldcup.jpg" alt="World Cup" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">Global</span>
                <h3>World Cup</h3>
                <p>Full bracket · Grand prize pool</p>
              </div>
            </div>

            <div className="scb-tournament-card">
              <img src="/images/tournament-euro.jpg" alt="Euro Championship" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">Europe</span>
                <h3>Euro Championship</h3>
                <p>Elite teams · Big rewards</p>
              </div>
            </div>

            <div className="scb-tournament-card">
              <img src="/images/tournament-copaamerica.jpg" alt="Copa América" />
              <div className="scb-tournament-card__content">
                <span className="scb-pill">South America</span>
                <h3>Copa América</h3>
                <p>Classic rivalries · Derby atmosphere</p>
              </div>
            </div>
          </div>
        </section>

        <section id="why" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Why SmartCup League?</h2>
          </header>

          <div className="scb-grid scb-grid--why">
            <div className="scb-feature-card scb-feature-card--left">
              <h3>🏆 Grand Final Championship</h3>
              <p>
                Every outcome you choose contributes points toward the Grand Final Championship Pool — the season-long
                competition where the most consistent players share the final reward pool. It’s not about one lucky
                match. It’s about proving your skill over time.
              </p>
            </div>

            <div className="scb-feature-card scb-feature-card--left">
              <h3>⚡ Instant On-Chain Settlement</h3>
              <p>
                SmartCup League runs entirely on autonomous smart contracts. As soon as a match result is verified,
                rewards become instantly available for claim — directly from the protocol, without intermediaries or
                manual processing. No custody. No delays. No intermediaries. Just transparent, self-service settlement.
              </p>
            </div>

            <div className="scb-feature-card scb-feature-card--left">
              <h3>🛡 Fair-Play Markets by Design</h3>
              <p>
                SmartCup League is built to eliminate structural advantages. There is no house edge, no manual odds
                setting, no central operator shaping outcomes. All market prices are generated through an on-chain
                Automated Market Maker (AMM), driven purely by player liquidity and positions.
              </p>
            </div>
          </div>
        </section>

        <section className="scb-section scb-section--highlights">
          <header className="scb-section__header scb-section__header--center">
            <h2>The Next Top Clashes</h2>
            <p>Predict the next matches before kickoff and start climbing the leaderboard.</p>
          </header>

          <div className="scb-highlights">
            {highlightMatches.map((match) => {
              const homeFlag = flagSrc(match.home);
              const awayFlag = flagSrc(match.away);
              const kickoff = kickOffToMs(match.kick_off);

              return (
                <button
                  className="scb-highlight"
                  type="button"
                  key={`${match.phase}-${match.match_id}`}
                  onClick={() => navigate(matchPath(match.phase, match.match_id))}>
                  <div className="scb-highlight__flags" aria-hidden="true">
                    <div className="scb-highlight__flagPane scb-highlight__flagPane--home">
                      {homeFlag ? <img src={homeFlag} alt="" /> : <span>{teamInitials(match.home)}</span>}
                    </div>
                    <div className="scb-highlight__flagPane scb-highlight__flagPane--away">
                      {awayFlag ? <img src={awayFlag} alt="" /> : <span>{teamInitials(match.away)}</span>}
                    </div>
                    <div className="scb-highlight__split" />
                  </div>

                  <div className="scb-highlight__overlay">
                    <span>{(match.phase || 'Upcoming').replace(/_/g, ' ')}</span>
                    <b>{match.home}</b>
                    <small>vs</small>
                    <b>{match.away}</b>
                    <em>{formatKickoff(kickoff)}</em>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Trust & transparency</h2>
            <p>Built by the Community. Play together, compete globally, and help shape the future of SmartCup.</p>
          </header>

          <div className="scb-grid scb-grid--trust">
            <div className="scb-feature-card scb-feature-card--left">
              <h3>Live Matchday Community</h3>
              <p>
                Join real-time discussions, celebrate big moments, and share predictions with other players across
                Discord and X.
              </p>
            </div>

            <div className="scb-feature-card scb-feature-card--left">
              <h3>SmartCupDAO Governance</h3>
              <p>
                Help shape the future of SmartCup through proposals, feature requests, and protocol decisions through
                SmartCupDAO. No centralized operators. No closed doors.
              </p>
            </div>

            <div className="scb-feature-card scb-feature-card--left">
              <h3>Global audience & special tournaments</h3>
              <p>
                Connect with football fans worldwide, participate in international on-chain competitions, and join
                special community events throughout the season.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>Frequently Asked Questions</h2>
            <p>New here? Get clear answers and start playing in minutes.</p>
          </header>

          <div className="scb-faq">
            <details className="scb-faq__item">
              <summary>Is SmartCup League a sportsbook?</summary>
              <p>
                No. SmartCup League is a gamified prediction platform where players compete against each other — not
                against a house. There are no fixed odds, no bookmaker margins, and no platform advantage. All prices
                emerge from community pools through an automated on-chain system. You play against players. Not a
                platform.
              </p>
            </details>

            <details className="scb-faq__item">
              <summary>How do I start playing?</summary>
              <p>
                Getting started takes less than a minute. Connect your Web3 wallet. Choose a tournament. Select a match
                and make your prediction. No account creation. No personal data. No paperwork. Just connect and play.
              </p>
            </details>

            <details className="scb-faq__item">
              <summary>How are rewards calculated?</summary>
              <p>
                All rewards come from shared prediction pools. When you join a match, your stake goes into a pool with
                other players. If your prediction is correct, you receive a proportional share of that pool. The payout
                multiplier depends on how many players chose the same outcome. More popular outcomes = lower multiplier.
                Less popular outcomes = higher multiplier. No manual adjustments.
              </p>
            </details>

            <details className="scb-faq__item">
              <summary>When and how do I get paid?</summary>
              <p>
                After a match is finalized, rewards become available on-chain. You can claim your winnings directly from
                the smart contract — without intermediaries or approval. No waiting for manual processing. No withdrawal
                requests. No hidden rules. If you win, you claim.
              </p>
            </details>

            <details className="scb-faq__item">
              <summary>Is my money safe?</summary>
              <p>
                SmartCup never holds user funds. All stakes are locked in audited smart contracts and managed by
                automated rules. They are never sent to company wallets or DAO treasuries. Every pool, payout, and
                transaction is publicly verifiable on-chain. Security and transparency are built into the protocol.
              </p>
            </details>
          </div>
        </section>

        <section className="scb-section scb-section--cta">
          <div className="scb-cta">
            <h2>Ready for kickoff?</h2>
            <p>Enter the app and start predicting soccer outcomes on-chain with the community</p>
            <button className="scb-btn scb-btn--primary scb-btn--lg" onClick={() => navigate('/all-matches')}>
              Join SmartCup League
            </button>
          </div>
        </section>
      </main>

      <footer className="scb-footer">
        <div className="scb-footer__legal">
          <span>© 2026 SmartCup League</span>
          <span className="scb-footer__sep" aria-hidden="true">·</span>
          <Link to="/terms-of-use" className="scb-footer__link">Terms of Use</Link>
          <span className="scb-footer__sep" aria-hidden="true">·</span>
          <Link to="/rules" className="scb-footer__link">Rules</Link>
          <span className="scb-footer__sep" aria-hidden="true">·</span>
          <Link to="/dao-constitution" className="scb-footer__link">DAO Constitution</Link>
        </div>

        <div className="scb-footer__socials" aria-label="SmartCup League social links">
          {socialLinks.map((item) => (
            <a
              key={item.href}
              className="scb-footer__social"
              href={item.href}
              target="_blank"
              rel="noreferrer"
              aria-label={item.label}>
              {item.icon}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default Landing;
