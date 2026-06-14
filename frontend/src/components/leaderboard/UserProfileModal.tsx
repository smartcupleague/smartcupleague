import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import styled, { keyframes } from 'styled-components';

/* ── Animations ── */
const appear = keyframes`
  from { opacity: 0; transform: scale(0.94) translateY(10px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);    }
`;

const glowPulse = keyframes`
  0%, 100% { box-shadow: 0 0 28px rgba(255, 46, 118, 0.18), 0 40px 90px rgba(0,0,0,0.70); }
  50%       { box-shadow: 0 0 48px rgba(255, 46, 118, 0.32), 0 40px 90px rgba(0,0,0,0.70); }
`;

const shimmer = keyframes`
  0%   { transform: translateX(-120%) skewX(-16deg); opacity: 0; }
  20%  { opacity: 0.55; }
  60%  { opacity: 0.20; }
  100% { transform: translateX(120%)  skewX(-16deg); opacity: 0; }
`;

const rotateBorder = keyframes`
  to { --angle: 360deg; }
`;

/* ── Backdrop ── */
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 0, 6, 0.82);
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;

  @media (max-width: 600px) {
    align-items: center;
    padding: 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;

/* ── Card ── */
const Card = styled.div`
  position: relative;
  width: min(440px, 96vw);
  padding: 32px 28px 28px;
  border-radius: 24px;
  overflow: hidden;

  background:
    radial-gradient(ellipse 80% 50% at 18% 0%,   rgba(122, 19, 73, 0.38) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 88% 90%,  rgba(78, 10, 49, 0.30) 0%, transparent 60%),
    radial-gradient(ellipse 100% 80% at 50% 50%, rgba(36, 0, 22, 0.95) 0%, rgba(18, 0, 8, 0.99) 100%);

  border: 1px solid rgba(255, 46, 118, 0.28);

  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 40px 100px rgba(0, 0, 0, 0.80),
    0 0 60px rgba(122, 19, 73, 0.20);

  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: ${appear} 0.20s cubic-bezier(0.34, 1.56, 0.64, 1) both, ${glowPulse} 4s ease-in-out 0.4s infinite;

  /* Shimmer layer */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 35%,
      rgba(255, 46, 118, 0.06) 50%,
      transparent 65%
    );
    pointer-events: none;
  }

  /* Top accent line */
  &::after {
    content: '';
    position: absolute;
    top: 0; left: 10%; right: 10%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 46, 118, 0.70), rgba(255, 180, 220, 0.50), rgba(255, 46, 118, 0.70), transparent);
    border-radius: 999px;
  }

  @media (max-width: 600px) {
    width: min(440px, 96vw);
    max-height: calc(100dvh - 20px);
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    gap: 14px;
    padding: 16px 14px 14px;
    border-radius: 16px;
  }
`;

/* ── Close ── */
const CloseBtn = styled.button`
  position: absolute;
  top: 14px; right: 16px;
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.40);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  &:hover {
    background: rgba(255, 46, 118, 0.18);
    border-color: rgba(255, 46, 118, 0.45);
    color: rgba(255, 180, 200, 0.95);
    transform: scale(1.08);
  }

  @media (max-width: 600px) {
    position: sticky;
    top: 0;
    right: auto;
    z-index: 3;
    align-self: flex-end;
    width: 44px;
    height: 44px;
    margin: -6px -4px -36px 0;
    border-radius: 12px;
    background: rgba(28, 0, 16, 0.82);
    color: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
`;

/* ── Header ── */
const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  padding-right: 30px;

  @media (max-width: 600px) {
    min-width: 0;
    gap: 12px;
    padding-right: 48px;
  }
`;

const AvatarWrap = styled.div<{ $isMe: boolean }>`
  flex-shrink: 0;
  position: relative;
  width: 62px; height: 62px;

  @media (max-width: 600px) {
    width: 48px;
    height: 48px;
  }
`;

const AvatarBg = styled.div<{ $isMe: boolean }>`
  width: 100%; height: 100%;
  border-radius: 50%;
  background: ${({ $isMe }) =>
    $isMe
      ? 'linear-gradient(135deg, #ff2e76 0%, #a80545 50%, #7a1349 100%)'
      : 'linear-gradient(135deg, #7a1349 0%, #4e0a31 50%, #3a0322 100%)'};
  border: 2px solid ${({ $isMe }) => $isMe ? 'rgba(255, 46, 118, 0.75)' : 'rgba(255, 46, 118, 0.30)'};
  box-shadow: ${({ $isMe }) =>
    $isMe
      ? '0 0 22px rgba(255, 46, 118, 0.45), 0 8px 24px rgba(0,0,0,0.55)'
      : '0 0 12px rgba(122, 19, 73, 0.35), 0 8px 24px rgba(0,0,0,0.55)'};
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 900;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: -0.5px;
  text-transform: uppercase;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.60);
  position: relative; overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: -60%; left: -40%;
    width: 60%; height: 220%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
    transform: skewX(-16deg);
    animation: ${shimmer} 3s ease-in-out 0.8s infinite;
  }

  @media (max-width: 600px) {
    font-size: 16px;
    letter-spacing: 0;
  }
`;

const HeaderInfo = styled.div`
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 6px;
`;

const PlayerName = styled.div`
  font-size: 19px; font-weight: 900;
  color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 12px rgba(255, 46, 118, 0.25);

  @media (max-width: 600px) {
    font-size: 17px;
    letter-spacing: 0;
  }
`;

const BadgeRow = styled.div`
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
`;

const RankBadge = styled.span`
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 800;
  letter-spacing: 0.08em;
  color: rgba(255, 220, 100, 0.95);
  background: rgba(255, 200, 50, 0.10);
  border: 1px solid rgba(255, 200, 50, 0.24);
  border-radius: 999px;
  padding: 3px 10px;

  @media (max-width: 600px) {
    min-height: 28px;
    letter-spacing: 0;
  }
`;

const MeBadge = styled.span`
  display: inline-flex; align-items: center;
  font-size: 10px; font-weight: 900;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(255, 160, 200, 0.95);
  background: rgba(255, 46, 118, 0.16);
  border: 1px solid rgba(255, 46, 118, 0.38);
  border-radius: 999px;
  padding: 2px 9px;

  @media (max-width: 600px) {
    min-height: 28px;
    letter-spacing: 0;
  }
`;

/* ── Divider ── */
const Divider = styled.div`
  height: 1px;
  margin: -4px 0;
  background: linear-gradient(90deg, transparent, rgba(255, 46, 118, 0.22), rgba(255, 255, 255, 0.06), rgba(255, 46, 118, 0.22), transparent);
`;

/* ── Address ── */
const AddressBlock = styled.div`
  display: flex; align-items: center; gap: 10px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 46, 118, 0.14);
  border-radius: 14px;
  padding: 11px 14px;

  @media (max-width: 600px) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
  }
`;

const AddressText = styled.span`
  flex: 1; min-width: 0;
  font-family: 'Courier New', 'SF Mono', monospace;
  font-size: 11.5px;
  color: rgba(255, 220, 235, 0.55);
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: 1.55;
  letter-spacing: 0.02em;

  @media (max-width: 600px) {
    font-size: 10.5px;
    letter-spacing: 0;
    line-height: 1.4;
  }
`;

const CopyBtn = styled.button<{ $copied: boolean }>`
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 11px; font-weight: 800;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid ${({ $copied }) => $copied ? 'rgba(52, 211, 153, 0.50)' : 'rgba(255, 46, 118, 0.30)'};
  background: ${({ $copied }) => $copied ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 46, 118, 0.10)'};
  color: ${({ $copied }) => $copied ? 'rgba(110, 255, 190, 0.92)' : 'rgba(255, 150, 190, 0.88)'};
  letter-spacing: 0.04em;
  &:hover { filter: brightness(1.18); transform: scale(1.03); }

  @media (max-width: 600px) {
    min-width: 64px;
    height: 44px;
    padding: 0 10px;
    letter-spacing: 0;
  }
`;

/* ── Stats grid ── */
const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  @media (max-width: 600px) {
    gap: 8px;
  }
`;

const StatCard = styled.div`
  position: relative; overflow: hidden;
  background: rgba(0, 0, 0, 0.30);
  border: 1px solid rgba(255, 46, 118, 0.14);
  border-radius: 16px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 5px;
  transition: border-color 0.18s, background 0.18s;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 80% 60% at 20% 0%, rgba(122, 19, 73, 0.18), transparent 70%);
    pointer-events: none;
  }

  &:hover {
    border-color: rgba(255, 46, 118, 0.30);
    background: rgba(122, 19, 73, 0.15);
  }

  @media (max-width: 600px) {
    min-width: 0;
    border-radius: 12px;
    padding: 12px;
  }
`;

const StatLabel = styled.div`
  font-size: 9.5px; font-weight: 800;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(255, 180, 210, 0.45);
  position: relative;

  @media (max-width: 600px) {
    font-size: 10px;
    letter-spacing: 0;
    line-height: 1.2;
  }
`;

const StatValue = styled.div<{ $gold?: boolean; $green?: boolean; $plain?: boolean }>`
  font-size: 26px; font-weight: 1000;
  letter-spacing: -0.8px; line-height: 1;
  font-variant-numeric: tabular-nums;
  position: relative;

  ${({ $gold }) => $gold && `
    background: linear-gradient(135deg, #fff6bf 0%, #ffd36a 28%, #f5c542 52%, #d6a21e 68%, #fff1b0 88%, #ffffff 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 6px rgba(255, 200, 50, 0.30));
  `}

  ${({ $green }) => $green && `
    background: linear-gradient(135deg, #6effc0 0%, #34d399 50%, #10b981 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 2px 6px rgba(52, 211, 153, 0.28));
  `}

  ${({ $plain }) => $plain && `
    color: rgba(255, 220, 235, 0.88);
  `}

  @media (max-width: 600px) {
    font-size: 22px;
    letter-spacing: 0;
  }
`;

const StatSuffix = styled.span`
  font-size: 12px; font-weight: 700;
  color: rgba(255, 180, 210, 0.45);
  letter-spacing: 0.08em;
  margin-left: 3px;

  @media (max-width: 600px) {
    font-size: 11px;
    letter-spacing: 0;
  }
`;

/* ── Actions ── */
const Actions = styled.div`
  display: flex; gap: 10px;
  padding-top: 4px;

  @media (max-width: 600px) {
    gap: 8px;
    padding-top: 0;
  }
`;

const FollowBtn = styled.button<{ $following: boolean }>`
  flex: 1; height: 42px;
  border-radius: 14px;
  font-size: 13px; font-weight: 800;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: all 0.16s;
  position: relative; overflow: hidden;

  border: 1px solid ${({ $following }) =>
    $following ? 'rgba(52, 211, 153, 0.45)' : 'rgba(255, 46, 118, 0.52)'};

  background: ${({ $following }) =>
    $following
      ? 'rgba(52, 211, 153, 0.10)'
      : 'radial-gradient(600px 140px at 30% -20%, rgba(255,46,118,0.32), transparent 65%), rgba(122, 19, 73, 0.22)'};

  color: ${({ $following }) =>
    $following ? 'rgba(110, 255, 190, 0.92)' : 'rgba(255, 200, 220, 0.95)'};

  box-shadow: ${({ $following }) =>
    $following
      ? '0 4px 18px rgba(52,211,153,0.15)'
      : '0 4px 18px rgba(255, 46, 118, 0.20)'};

  &::after {
    content: '';
    position: absolute;
    top: -80%; left: -40%;
    width: 60%; height: 260%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
    transform: skewX(-16deg) translateX(-100%);
    transition: transform 0s;
  }
  &:hover::after { animation: ${shimmer} 1.8s ease-in-out; }
  &:hover { transform: translateY(-1px); filter: brightness(1.10); }
  &:active { transform: translateY(0); filter: brightness(0.97); }

  @media (max-width: 600px) {
    min-height: 44px;
    height: auto;
    letter-spacing: 0;
  }
`;

const CloseAction = styled.button`
  flex: 0 0 auto;
  height: 42px; padding: 0 20px;
  border-radius: 14px;
  font-size: 13px; font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: all 0.16s;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 220, 235, 0.60);
  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.82);
    border-color: rgba(255,255,255,0.18);
  }

  @media (max-width: 600px) {
    min-height: 44px;
    height: auto;
    padding: 0 14px;
    letter-spacing: 0;
  }
`;

/* ── Types ── */
export type ProfileRow = {
  rank: number;
  wallet: string;
  displayName?: string | null;
  totalPoints: number;
  matches: number;
  exact: number;
  outcomes: number;
};

type Props = {
  row: ProfileRow;
  isMe: boolean;
  isFollowed: boolean;
  onFollow: () => void;
  onClose: () => void;
};

function walletInitials(wallet: string) {
  return wallet.replace('0x', '').slice(0, 2).toUpperCase();
}

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export function UserProfileModal({ row, isMe, isFollowed, onFollow, onClose }: Props) {
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = () => {
    navigator.clipboard.writeText(row.wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const m = medal(row.rank);
  const displayLabel = row.displayName ?? (row.wallet.slice(0, 8) + '…' + row.wallet.slice(-6));
  const accuracyPct = row.matches > 0 ? ((row.exact / row.matches) * 100).toFixed(0) : null;

  return ReactDOM.createPortal(
    <Backdrop onClick={onClose}>
      <Card onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${displayLabel} leaderboard profile`}>
        <CloseBtn type="button" onClick={onClose} aria-label="Close">✕</CloseBtn>

        {/* ── Header ── */}
        <Header>
          <AvatarWrap $isMe={isMe}>
            <AvatarBg $isMe={isMe}>{walletInitials(row.wallet)}</AvatarBg>
          </AvatarWrap>
          <HeaderInfo>
            <PlayerName title={row.wallet}>{displayLabel}</PlayerName>
            <BadgeRow>
              <RankBadge>
                {m && <span>{m}</span>}
                #{row.rank} Global
              </RankBadge>
              {isMe && <MeBadge>YOU</MeBadge>}
            </BadgeRow>
          </HeaderInfo>
        </Header>

        <Divider />

        {/* ── Wallet address ── */}
        <AddressBlock>
          <AddressText>{row.wallet}</AddressText>
          <CopyBtn type="button" $copied={copied} onClick={copy}>
            {copied ? '✓ Copied' : 'Copy'}
          </CopyBtn>
        </AddressBlock>

        {/* ── Stats ── */}
        <StatsGrid>
          <StatCard>
            <StatLabel>Total Points</StatLabel>
            <StatValue $gold={true}>{row.totalPoints}</StatValue>
          </StatCard>

          <StatCard>
            <StatLabel>Matches Played</StatLabel>
            <StatValue $plain={true}>
              {row.matches > 0 ? row.matches : '—'}
            </StatValue>
          </StatCard>

          <StatCard>
            <StatLabel>Exact Picks</StatLabel>
            <StatValue $plain={true}>
              {row.exact > 0 ? row.exact : '—'}
              {accuracyPct && row.exact > 0
                ? <StatSuffix>({accuracyPct}%)</StatSuffix>
                : null}
            </StatValue>
          </StatCard>

          <StatCard>
            <StatLabel>Correct Outcomes</StatLabel>
            <StatValue $plain={true}>
              {row.outcomes > 0 ? row.outcomes : '—'}
            </StatValue>
          </StatCard>
        </StatsGrid>

        {/* ── Actions ── */}
        <Actions>
          <FollowBtn
            type="button"
            $following={isFollowed}
            onClick={onFollow}>
            {isFollowed ? '✓ Following' : '+ Follow'}
          </FollowBtn>
          <CloseAction type="button" onClick={onClose}>Close</CloseAction>
        </Actions>
      </Card>
    </Backdrop>,
    document.body
  );
}
