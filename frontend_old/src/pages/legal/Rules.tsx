import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import './legal.css';

export default function Rules() {
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
        <h1 className="legal-title">SmartCup League Tournament Rules</h1>
        <p className="legal-updated">How Match Predictions and the Season Leaderboard Work</p>

        <section className="legal-section">
          <p>
            SmartCup League is a decentralized football prediction game built around two simultaneous competitions:
          </p>
          <ul>
            <li><strong>Match-by-Match Predictions</strong> — earn rewards after each match.</li>
            <li><strong>Season-Long Leaderboard</strong> — accumulate points across the entire tournament and compete for the Final Prize Pool.</li>
          </ul>
          <p>Every prediction participates in both games at the same time.</p>
        </section>

        <section className="legal-section">
          <h2>1. Match Predictions (Match-by-Match Game)</h2>
          <p><strong>The Pari-Mutuel Pool System</strong></p>
          <p>
            SmartCup League uses an Automated Market Mechanism (AMM) based on a pari-mutuel pool. This means:
          </p>
          <ul>
            <li>There are no fixed odds</li>
            <li>There is no bookmaker or house</li>
            <li>Payouts depend entirely on player participation</li>
          </ul>
          <p>
            All predictions for a match are collected into a shared pool, and winners split that pool proportionally once the match result is confirmed.
          </p>
        </section>

        <section className="legal-section">
          <h2>How the Match Pool Is Distributed</h2>
          <p>For every prediction placed:</p>
          <ul>
            <li><strong>85%</strong> goes to the Match Winner Pool</li>
            <li><strong>10%</strong> goes to the Season-Long Final Prize Pool</li>
            <li><strong>5%</strong> goes to the DAO treasury as a protocol fee</li>
          </ul>
          <p>Only the 85% match pool is distributed among winners of that specific match.</p>
        </section>

        <section className="legal-section">
          <h2>Why Payouts Are Variable</h2>
          <p>The payout is calculated as: <strong>Match Pool ÷ Number of Winning Predictions</strong></p>
          <p>This means:</p>
          <ul>
            <li>Rare correct predictions pay more</li>
            <li>Popular outcomes pay less</li>
            <li>A correct prediction may sometimes return less than the entry amount if many users predicted the same result</li>
          </ul>
          <p>This is a natural outcome of the shared pari-mutuel pool system.</p>
        </section>

        <section className="legal-section">
          <h2>Example</h2>
          <p>100 players enter a match — Total entries: 300 VARA — Match pool (85%): 255 VARA</p>
          <ul>
            <li><strong>Scenario A — 10 winners:</strong> Each winner receives 25.5 VARA</li>
            <li><strong>Scenario B — 150 winners:</strong> Each winner receives 1.7 VARA</li>
          </ul>
          <p>Both predictions are correct — the difference is how many players share the pool.</p>
        </section>

        <section className="legal-section">
          <h2>Prediction Rules</h2>
          <p>For each match:</p>
          <ul>
            <li>Minimum prediction entry: <strong>3 VARA</strong></li>
            <li>Only one prediction per wallet per match</li>
            <li>Predictions close 10 minutes before kickoff</li>
            <li>Predictions cannot be edited or cancelled after submission</li>
          </ul>
          <p>These rules are enforced automatically by smart contracts.</p>
        </section>

        <section className="legal-section">
          <h2>2. What You Can Predict</h2>
          <p>Players submit one score prediction per match. Your score determines both points and payout eligibility.</p>
          <p><strong>Group Stage Matches</strong></p>
          <ul>
            <li>Exact score prediction → 3 points + eligible for payout</li>
            <li>Correct outcome (win / draw / loss) → 1 point + eligible for payout</li>
            <li>Incorrect prediction → 0 points</li>
          </ul>
          <p><strong>Knockout Matches</strong></p>
          <p>
            Players predict the full-time score. If predicting a draw, they must also select the penalty winner.
            If the match ends in a draw, the penalty winner determines the final outcome and correct winner after penalties earns points.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Match Settlement and Rewards</h2>
          <p>After the match ends:</p>
          <ul>
            <li>The match result is confirmed by an oracle</li>
            <li>Smart contracts verify the result</li>
            <li>The match pool is distributed automatically</li>
            <li>Winning players can claim their rewards directly from the smart contract</li>
          </ul>
          <p>Key rules:</p>
          <ul>
            <li>Winners share 85% of the pool</li>
            <li>Rewards are distributed proportionally</li>
            <li>If no one wins, the match pool is added to the Final Prize Pool</li>
          </ul>
          <p>All settlements are executed fully on-chain and cannot be modified by any operator.</p>
        </section>

        <section className="legal-section">
          <h2>4. The Season-Long Leaderboard</h2>
          <p>
            Every prediction also contributes to a global tournament leaderboard. Points accumulate throughout
            the tournament, and players compete to reach the Top 5 positions.
          </p>
          <p><strong>Points System</strong></p>
          <ul>
            <li>Exact Score → <strong>3 points</strong></li>
            <li>Correct Outcome → <strong>1 point</strong></li>
            <li>Incorrect → <strong>0 points</strong></li>
          </ul>
          <p><strong>Tournament Phase Weights</strong> — later matches award more points:</p>
          <ul>
            <li>Group Stage → ×1</li>
            <li>Round of 32 → ×2</li>
            <li>Round of 16 → ×3</li>
            <li>Quarter-Finals → ×4</li>
            <li>Semi-Finals → ×5</li>
            <li>Third Place Match → ×6</li>
            <li>Final → ×8</li>
          </ul>
          <p>Example: Exact score in Quarter-Final → 3 × 4 = <strong>12 points</strong></p>
        </section>

        <section className="legal-section">
          <h2>5. Final Prize Pool</h2>
          <p>The Final Prize Pool is funded by:</p>
          <ul>
            <li>10% of every match entry</li>
            <li>Unclaimed or unused match pool balances</li>
          </ul>
          <p>After the tournament ends, the leaderboard is finalized, smart contracts calculate the prize allocation, and top players claim rewards on-chain.</p>
          <p><strong>Prize Distribution:</strong></p>
          <ul>
            <li>1st place → <strong>40%</strong></li>
            <li>2nd place → <strong>25%</strong></li>
            <li>3rd place → <strong>20%</strong></li>
            <li>4th place → <strong>10%</strong></li>
            <li>5th place → <strong>5%</strong></li>
          </ul>
          <p>
            <strong>Tie-Break Rule:</strong> If two or more players finish with the same number of points,
            the prize allocations for the tied positions are combined and divided equally among them.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Key Principles of SmartCup League</h2>
          <ul>
            <li><strong>Non-custodial</strong> — Players always control their own wallets.</li>
            <li><strong>House-free</strong> — The protocol never sets odds or takes the opposite side of predictions.</li>
            <li><strong>Transparent</strong> — All pools, payouts, and leaderboard rankings are verifiable on-chain.</li>
            <li><strong>Fully automated</strong> — Smart contracts enforce all rules, including prediction timing, payouts, and leaderboard updates.</li>
          </ul>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
