import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './landing.css';

type Slide = { src: string; alt: string; kicker?: string; title: string; subtitle: string };

export const Landing: React.FC = () => {
  const navigate = useNavigate();

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
            <a href="#tournaments">Tournaments</a>
            <a href="#why">Why</a>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
          </div>
        </div>

        <div className="scb-nav__right">
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

          <button className="scb-btn scb-btn--primary" onClick={() => navigate('/home')}>
            Enter app
          </button>
        </div>
      </nav>

      <main id="top">
        <section
          className="scb-hero-carousel"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}>
          <div className="scb-carousel" role="region" aria-label="Hero carousel">
            {slides.map((s, idx) => (
              <div key={s.src} className={`scb-slide ${idx === active ? 'is-active' : ''}`}>
                <img src={s.src} alt={s.alt} className="scb-slide__img" />
                <div className="scb-slide__gradient" />

                <div className="scb-slide__content">
                  <p className="scb-hero__kicker">{s.kicker ?? 'SMARTCUP LEAGUE'}</p>

                  <h1 className="scb-hero__headline">
                    <span className="scb-hero__headline-main">{s.title}</span>
                    <span className="scb-hero__headline-line">{s.subtitle}</span>
                    <span className="scb-hero__headline-line">
                      Soccer prediction markets on the <span className="scb-hero__highlight">blockchain</span>
                    </span>
                  </h1>

                  <div className="scb-hero__cta-row">
                    <button className="scb-btn scb-btn--primary scb-hero__cta" onClick={() => navigate('/home')}>
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

        <section id="prediction" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>What is a sport prediction game?</h2>
            <p>
              SmartCup League is not a traditional sports bookmaker. It’s a gamified, on-chain prediction tournament
              where players compete with each other — not against a house. Two games in one: win match-by-match and
              climb a season-long leaderboard. No custody. No manipulation. Full transparency.
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
        </section>

        <section className="scb-section scb-section--band">
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
              <p className="scb-band__value">20%</p>
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
            <h2>Tonight’s top clashes</h2>
            <p>Next top clashes</p>
          </header>

          <div className="scb-highlights">
            <div className="scb-highlight">
              <img src="/images/highlight-spain-france.jpg" alt="Spain vs France" />
              <div className="scb-highlight__overlay">
                <span>Europe</span>
                Spain 🇪🇸 vs 🇫🇷 France
              </div>
            </div>

            <div className="scb-highlight">
              <img src="/images/highlight-argentina-uruguay.jpg" alt="Argentina vs Uruguay" />
              <div className="scb-highlight__overlay">
                <span>South America</span>
                Argentina 🇦🇷 vs 🇺🇾 Uruguay
              </div>
            </div>

            <div className="scb-highlight">
              <img src="/images/highlight-england-germany.jpg" alt="England vs Germany" />
              <div className="scb-highlight__overlay">
                <span>Global</span>
                England 🏴 vs 🇩🇪 Germany
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="scb-section scb-section--tight">
          <header className="scb-section__header scb-section__header--center">
            <h2>How it works</h2>
            <p>From wallet to prediction in minutes.</p>
          </header>

          <div className="scb-steps scb-steps--cards">
            <div className="scb-step-card">
              <div className="scb-step-card__num">1</div>
              <div>
                <b>Connect your wallet</b>
                <p>
                  Use your Subwallet to start playing instantly. No account creation or personal data needed — just
                  connect and you’re in.
                </p>
              </div>
            </div>

            <div className="scb-step-card">
              <div className="scb-step-card__num">2</div>
              <div>
                <b>Join a tournament & make your predictions</b>
                <p>
                  Choose a tournament and select the matches you want to predict. Each position enters you into the
                  match-by-match polls and also the season-long Grand Final Championship.
                </p>
              </div>
            </div>

            <div className="scb-step-card">
              <div className="scb-step-card__num">3</div>
              <div>
                <b>Score points & climb the leaderboard</b>
                <p>
                  Accurate outcomes earn more points; partial predictions still count; missed outcomes earn none. Your
                  points accumulate throughout the tournament, helping you climb the leaderboard and compete for the
                  ultimate on-chain rewards.
                </p>
              </div>
            </div>
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
            <button className="scb-btn scb-btn--primary scb-btn--lg" onClick={() => navigate('/home')}>
              Join SmartCup League
            </button>
          </div>
        </section>
      </main>

      <footer className="scb-footer">© {new Date().getFullYear()} SmartCupLeague</footer>
    </div>
  );
};

export default Landing;