import React, { useEffect, useState } from 'react';
import './OnboardingModal.css';

interface Props {
  onAccept: (nickname: string) => void | Promise<void>;
  onClose: () => void;
  canClose?: boolean;
}

export const OnboardingModal: React.FC<Props> = ({ onAccept, onClose, canClose = true }) => {
  const [checkedTerms, setCheckedTerms] = useState(false);
  const [checkedAge, setCheckedAge] = useState(false);
  const [openedTerms, setOpenedTerms] = useState(false);
  const [nickname, setNickname] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = openedTerms && checkedTerms && checkedAge && !isSubmitting;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting && canClose) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canClose, isSubmitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onAccept(nickname);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save your nickname. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-backdrop" aria-hidden="true" />
      <div className="ob-panel">
        {canClose ? (
          <button
            className="ob-close"
            type="button"
            aria-label="Close onboarding"
            onClick={onClose}
            disabled={isSubmitting}
          >
            &times;
          </button>
        ) : null}

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
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Your display name"
                maxLength={30}
                autoComplete="nickname"
                aria-invalid={error ? 'true' : undefined}
                aria-describedby="ob-nickname-help"
              />
              <p className="ob-field__help" id="ob-nickname-help">
                This will be your profile name and leaderboard ID. If you leave it blank, your wallet address will be shown instead.
              </p>
            </div>
          </div>

          <div className="ob-checks">
            <a
              href="/terms-of-use"
              target="_blank"
              rel="noopener noreferrer"
              className="ob-terms-btn"
              onClick={() => setOpenedTerms(true)}
            >
              Read Terms of Use
            </a>

            <label className="ob-check" htmlFor="ob-terms">
              <input
                id="ob-terms"
                type="checkbox"
                className="ob-check__input"
                checked={checkedTerms}
                disabled={!openedTerms}
                onChange={(e) => setCheckedTerms(e.target.checked)}
              />
              <span className="ob-check__box" aria-hidden="true" />
              <span className="ob-check__text">
                I have read the Terms of Use and agree to be bound by them.
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
            {isSubmitting ? 'Saving...' : 'Continue to Match Predictions →'}
          </button>

          {!canContinue && (
            <p className="ob-hint" role="alert">
              Please open the Terms of Use and accept both checkboxes to continue.
            </p>
          )}

          {error && (
            <p className="ob-hint" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
