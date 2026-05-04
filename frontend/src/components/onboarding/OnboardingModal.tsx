import React, { useState } from 'react';
import './OnboardingModal.css';

interface Props {
  onAccept: (nickname: string, email: string) => void;
}

export const OnboardingModal: React.FC<Props> = ({ onAccept }) => {
  const [checkedTerms, setCheckedTerms] = useState(false);
  const [checkedAge, setCheckedAge] = useState(false);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');

  const canContinue = checkedTerms && checkedAge;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    onAccept(nickname, email);
  };

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-backdrop" aria-hidden="true" />
      <div className="ob-panel">
        <div className="ob-logo">
          <img src="/Logos.png" alt="SmartCup League" className="ob-logo__img" />
        </div>

        <h2 className="ob-title" id="ob-title">Before you start playing</h2>
        <p className="ob-subtitle">
          To participate in SmartCup League predictions, you must review the platform rules
          and confirm that you are 18 years of age or older.
        </p>

        <div className="ob-rules-box">
          <p className="ob-rules-label">Please review the SmartCup League tournament rules:</p>
          <ul className="ob-rules-list">
            <li className="ob-rules-item">
              <span className="ob-rules-check">✔</span> Match prediction rules
            </li>
            <li className="ob-rules-item">
              <span className="ob-rules-check">✔</span> Season-long leaderboard system
            </li>
            <li className="ob-rules-item">
              <span className="ob-rules-check">✔</span> Prize pool distribution
            </li>
          </ul>
          <a
            href="/rules"
            target="_blank"
            rel="noopener noreferrer"
            className="ob-rules-btn"
          >
            View Full Rules
          </a>
        </div>

        <form className="ob-form" onSubmit={handleSubmit} noValidate>
          <div className="ob-fields">
            <div className="ob-field">
              <label className="ob-field__label" htmlFor="ob-nickname">
                Nickname <span className="ob-optional">(optional)</span>
              </label>
              <input
                id="ob-nickname"
                className="ob-field__input"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your display name"
                maxLength={32}
                autoComplete="nickname"
              />
            </div>

            <div className="ob-field">
              <label className="ob-field__label" htmlFor="ob-email">
                Email <span className="ob-optional">(optional)</span>
              </label>
              <input
                id="ob-email"
                className="ob-field__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="ob-checks">
            <label className="ob-check" htmlFor="ob-terms">
              <input
                id="ob-terms"
                type="checkbox"
                className="ob-check__input"
                checked={checkedTerms}
                onChange={(e) => setCheckedTerms(e.target.checked)}
              />
              <span className="ob-check__box" aria-hidden="true" />
              <span className="ob-check__text">
                I have read and agree to the{' '}
                <a href="/terms-of-use" target="_blank" rel="noopener noreferrer" className="ob-link">
                  Terms of Use
                </a>
                .
              </span>
            </label>

            <label className="ob-check" htmlFor="ob-age">
              <input
                id="ob-age"
                type="checkbox"
                className="ob-check__input"
                checked={checkedAge}
                onChange={(e) => setCheckedAge(e.target.checked)}
              />
              <span className="ob-check__box" aria-hidden="true" />
              <span className="ob-check__text">I confirm that I am 18 years of age or older.</span>
            </label>
          </div>

          <button
            className={'ob-cta ' + (canContinue ? 'ob-cta--active' : 'ob-cta--disabled')}
            type="submit"
            disabled={!canContinue}
            aria-disabled={!canContinue}>
            Continue to Match Predictions →
          </button>

          {!canContinue && (
            <p className="ob-hint" role="alert">
              Please accept both checkboxes to continue.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
