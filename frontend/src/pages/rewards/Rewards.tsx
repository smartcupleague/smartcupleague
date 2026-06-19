import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { FaCheck, FaCopy, FaExternalLinkAlt, FaTimes, FaUserFriends } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { PiGiftBold } from 'react-icons/pi';
import { StyledWallet } from '@/components/wallet/Wallet';
import { useFreebetBalance } from '@/hooks/useFreebetBalance';
import { useToast } from '@/hooks/useToast';
import { formatVaraCompact } from '@/utils/formatters';
import { shortAddress, toHexAddress } from '@/utils/address';
import './rewards.css';

function getRewardsApiBase() {
  const configured = (import.meta.env.VITE_REWARDS_API_URL as string | undefined)?.replace(/\/$/, '');
  if (configured) return configured;

  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ) {
    return 'http://127.0.0.1:3002';
  }

  return '';
}

const REWARDS_API_BASE = getRewardsApiBase();
const SMARTCUP_X_URL = 'https://x.com/smartcupleague';
const SMARTCUP_APP_URL = 'smartcupleague.com';

type XTask = {
  taskType: 'repost' | 'post';
  amountVara: string;
  cadence: string;
};

const CAMPAIGN_X_REWARD_AMOUNTS: Record<XTask['taskType'], string> = {
  repost: '2000',
  post: '5000',
};

type RewardTasks = {
  x?: XTask[];
};

type ReferralReward = {
  id: string;
  milestone: 5;
  recipient: 'referrer' | 'friend';
  amountPlanck: string;
  paidAt: string | null;
};

type ReferralProgress = {
  betCount: number;
  requiredBets?: number;
  milestone5Passed: boolean;
};

type ReferralPair = {
  id: string;
  referrer: string;
  referrerActorId: string;
  friend: string;
  friendActorId: string;
  acceptedAt: string;
  progress: ReferralProgress;
  rewards: ReferralReward[];
};

type ReferralDashboard = {
  actorId: string;
  invited: ReferralPair[];
  accepted: ReferralPair | null;
};

function fallbackTasks(): RewardTasks {
  return {
    x: [
      { taskType: 'repost', amountVara: CAMPAIGN_X_REWARD_AMOUNTS.repost, cadence: 'weekly' },
      { taskType: 'post', amountVara: CAMPAIGN_X_REWARD_AMOUNTS.post, cadence: 'weekly' },
    ],
  };
}

function normalizeCampaignTasks(tasks: RewardTasks): RewardTasks {
  return {
    ...tasks,
    x: (tasks.x ?? fallbackTasks().x ?? []).map((task) => ({
      ...task,
      amountVara: CAMPAIGN_X_REWARD_AMOUNTS[task.taskType] ?? task.amountVara,
    })),
  };
}

function formatWholeVara(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!REWARDS_API_BASE) {
    throw new Error('Rewards API is not configured');
  }

  const res = await fetch(`${REWARDS_API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message || `Rewards API failed with ${res.status}`);
  }

  return res.json() as Promise<T>;
}

function taskCopy(taskType: XTask['taskType']) {
  if (taskType === 'repost') {
    return {
      title: 'Repost SmartCupLeague post',
      meta: 'Repost an official @SmartCupLeague post, then paste the post URL.',
      action: 'Open SmartCup X',
    };
  }
  return {
    title: 'Make a SmartCup League post',
    meta: 'Publish a SmartCup campaign post, then paste your published X URL.',
    action: 'Open X draft',
  };
}

function buildXIntentUrl(text: string) {
  return `https://twitter.com/intent/tweet?${new URLSearchParams({ text }).toString()}`;
}

function getXTaskTemplate(taskType: XTask['taskType']) {
  if (taskType === 'repost') {
    return 'Repost any official @SmartCupLeague campaign post, then paste the SmartCup post URL and your X username here.';
  }

  return [
    'I am joining SmartCup League on Vara! 🏆',
    '',
    'Set your agent, make football predictions, and compete through tournament leaderboards for the best takes.',
    '',
    SMARTCUP_APP_URL,
    '',
    '#SmartCupLeague #VaraNetwork #WorldCup #Predictions',
  ].join('\n');
}

function getTaskActionUrl(taskType: XTask['taskType'], template: string) {
  return taskType === 'repost' ? SMARTCUP_X_URL : buildXIntentUrl(template);
}

export function Rewards() {
  const toast = useToast();
  const { account } = useAccount();
  const { balance, error: balanceError, isLoading: balanceLoading, refetch: refetchBalance, wallet } = useFreebetBalance();
  const walletHex = useMemo(() => {
    const raw = account?.decodedAddress ?? (account as any)?.address ?? null;
    return toHexAddress(raw);
  }, [account]);

  const [tasks, setTasks] = useState<RewardTasks>(fallbackTasks());
  const [tasksLoading, setTasksLoading] = useState(false);
  const [xTaskType, setXTaskType] = useState<XTask['taskType']>('repost');
  const [tweetUrl, setTweetUrl] = useState('');
  const [xUsername, setXUsername] = useState('');
  const [xSubmitting, setXSubmitting] = useState(false);
  const [activeTask, setActiveTask] = useState<XTask['taskType'] | null>(null);
  const [referralDashboard, setReferralDashboard] = useState<ReferralDashboard | null>(null);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [acceptingReferral, setAcceptingReferral] = useState(false);
  const pendingReferrer = useMemo(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    const refHex = toHexAddress(ref);
    return refHex && refHex !== walletHex ? refHex : null;
  }, [walletHex]);
  const referralLink = useMemo(() => {
    if (!walletHex) return '';
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('ref', walletHex);
    return url.toString();
  }, [walletHex]);

  const loadTasks = useCallback(async () => {
    if (!REWARDS_API_BASE) {
      setTasks(fallbackTasks());
      return;
    }

    setTasksLoading(true);
    try {
      setTasks(normalizeCampaignTasks(await apiJson<RewardTasks>('/rewards/tasks')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load rewards tasks');
      setTasks(fallbackTasks());
    } finally {
      setTasksLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const loadReferralDashboard = useCallback(async () => {
    if (!walletHex) {
      setReferralDashboard(null);
      return;
    }
    if (!REWARDS_API_BASE) {
      setReferralDashboard(null);
      return;
    }

    setReferralsLoading(true);
    try {
      setReferralDashboard(await apiJson<ReferralDashboard>(`/rewards/referrals/${encodeURIComponent(walletHex)}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load referrals');
    } finally {
      setReferralsLoading(false);
    }
  }, [toast, walletHex]);

  useEffect(() => {
    void loadReferralDashboard();
  }, [loadReferralDashboard]);

  const submitX = async (event: FormEvent) => {
    event.preventDefault();
    if (!walletHex) {
      toast.error('Connect wallet first');
      return;
    }
    if (!tweetUrl.trim()) {
      toast.error('Tweet URL is required');
      return;
    }

    setXSubmitting(true);
    try {
      await apiJson('/rewards/x/submit', {
        method: 'POST',
        body: JSON.stringify({
          wallet: walletHex,
          taskType: xTaskType,
          tweetUrl: tweetUrl.trim(),
          xUsername: xUsername.trim() || undefined,
        }),
      });
      setTweetUrl('');
      setXUsername('');
      setActiveTask(null);
      toast.success('Freebet reward granted');
      await refetchBalance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit X task');
    } finally {
      setXSubmitting(false);
    }
  };

  const activeTaskConfig = activeTask ? taskCopy(activeTask) : null;
  const activeTaskReward = activeTask
    ? (tasks.x ?? fallbackTasks().x ?? []).find((task) => task.taskType === activeTask)?.amountVara
    : null;
  const activeTemplate = activeTask ? getXTaskTemplate(activeTask) : '';
  const activeActionUrl = activeTask ? getTaskActionUrl(activeTask, activeTemplate) : '';

  const openTask = (taskType: XTask['taskType']) => {
    setXTaskType(taskType);
    setActiveTask(taskType);
    setTweetUrl('');
    setXUsername('');
  };

  const copyTemplate = async () => {
    if (!activeTemplate) return;
    await navigator.clipboard.writeText(activeTemplate);
    toast.success('X template copied');
  };

  const copyReferralLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied');
  };

  const acceptReferral = async () => {
    if (!walletHex || !pendingReferrer) {
      toast.error('Connect wallet first');
      return;
    }

    setAcceptingReferral(true);
    try {
      await apiJson('/rewards/referrals/register', {
        method: 'POST',
        body: JSON.stringify({
          referrer: pendingReferrer,
          friend: walletHex,
        }),
      });
      toast.success('Referral connected');
      await loadReferralDashboard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not accept referral');
    } finally {
      setAcceptingReferral(false);
    }
  };

  const invited = referralDashboard?.invited ?? [];
  const accepted = referralDashboard?.accepted ?? null;

  return (
    <div className="rewards-page">
      <div className="rewards-shell">
        <header className="rewards-head">
          <div className="rewards-title">
            <h1>Rewards</h1>
            <p>Earn freebet credits for predictions. Winning claims return principal and pay net winnings as withdrawable VARA.</p>
          </div>
          <div className="rewards-wallet">
            <StyledWallet />
          </div>
        </header>

        <section className="rewards-panel rewards-balance">
          <div>
            <div className="rewards-balance__label">Available freebet balance</div>
            <div className="rewards-balance__value">{balanceLoading ? '...' : `${formatVaraCompact(balance)} VARA`}</div>
            <div className={balanceError ? 'rewards-balance__status rewards-error' : 'rewards-balance__status'}>
              {wallet ? balanceError || `Wallet ${shortAddress(wallet)}` : 'Connect wallet to load your balance'}
            </div>
          </div>
          <div className="rewards-actions">
            <a className="rewards-btn rewards-btn--soft" href={SMARTCUP_X_URL} target="_blank" rel="noreferrer">
              <FaXTwitter aria-hidden="true" /> @SmartCupLeague
            </a>
          </div>
        </section>

        <div className="rewards-grid">
          <section className="rewards-panel rewards-panel--x">
            <div className="rewards-panel__head">
              <div>
                <h2>X tasks</h2>
                <p>{tasksLoading ? 'Loading campaign tasks' : 'Weekly SmartCup social rewards'}</p>
              </div>
              <PiGiftBold aria-hidden="true" />
            </div>

            <div className="rewards-task-list">
              {(tasks.x ?? fallbackTasks().x ?? []).map((task) => {
                const copy = taskCopy(task.taskType);
                return (
                  <button className="rewards-task" type="button" key={task.taskType} onClick={() => openTask(task.taskType)}>
                    <div>
                      <div className="rewards-task__title">
                        <FaXTwitter aria-hidden="true" />
                        {copy.title}
                      </div>
                      <div className="rewards-task__meta">{copy.meta}</div>
                    </div>
                    <div className="rewards-task__side">
                      <div className="rewards-task__amount">{formatWholeVara(task.amountVara)} VARA</div>
                      <span>{copy.action}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rewards-panel rewards-panel--referrals">
            <div className="rewards-panel__head">
              <div>
                <h2>Referrals</h2>
                <p>Invite a friend. Earn freebet after 5 predictions.</p>
              </div>
              <FaUserFriends aria-hidden="true" />
            </div>

            {pendingReferrer && !accepted && (
              <div className="rewards-referral-alert">
                <div>
                  <strong>Referral invite detected</strong>
                  <span>{shortAddress(pendingReferrer)} invited you to SmartCup.</span>
                </div>
                <button className="rewards-btn" type="button" onClick={acceptReferral} disabled={!walletHex || acceptingReferral}>
                  <FaCheck aria-hidden="true" /> {acceptingReferral ? 'Connecting' : 'Accept'}
                </button>
              </div>
            )}

            <div className="rewards-referral-link">
              <input className="rewards-input" value={referralLink || 'Connect wallet to generate your link'} readOnly />
              <button
                className="rewards-btn rewards-btn--soft rewards-btn--icon"
                type="button"
                onClick={copyReferralLink}
                disabled={!referralLink}
                aria-label="Copy referral link"
                title="Copy referral link">
                <FaCopy aria-hidden="true" />
              </button>
            </div>

            {accepted && (
              <div className="rewards-referral-accepted">
                You joined through {shortAddress(accepted.referrerActorId)}
              </div>
            )}

            <div className="rewards-referral-list">
              {referralsLoading ? (
                <div className="rewards-empty">Loading referrals</div>
              ) : invited.length ? (
                invited.map((referral) => {
                  const betCount = Math.min(referral.progress.betCount ?? 0, 5);
                  const paid = referral.rewards.some((reward) => reward.recipient === 'referrer' && reward.milestone === 5);
                  return (
                    <div className="rewards-referral-card" key={referral.id}>
                      <div className="rewards-referral-card__top">
                        <div>
                          <strong>{shortAddress(referral.friendActorId)}</strong>
                          <span>Joined {new Date(referral.acceptedAt).toLocaleDateString()}</span>
                        </div>
                        <em>{paid ? 'Paid' : `${betCount}/5 bets`}</em>
                      </div>
                      <div className="rewards-progress" aria-label={`${betCount} of 5 bets`}>
                        <span style={{ width: `${(betCount / 5) * 100}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rewards-empty">No invited friends yet.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      {activeTask && activeTaskConfig && (
        <div className="rewards-modal" role="dialog" aria-modal="true" aria-labelledby="rewards-modal-title">
          <button className="rewards-modal__scrim" type="button" onClick={() => setActiveTask(null)} aria-label="Close" />
          <div className="rewards-modal__panel">
            <div className="rewards-modal__head">
              <div>
                <div className="rewards-modal__reward">{activeTaskReward ? formatWholeVara(activeTaskReward) : '0.00'} VARA freebet</div>
                <h2 id="rewards-modal-title">{activeTaskConfig.title}</h2>
                <p>{activeTaskConfig.meta}</p>
              </div>
              <button className="rewards-icon-btn" type="button" onClick={() => setActiveTask(null)} aria-label="Close">
                <FaTimes aria-hidden="true" />
              </button>
            </div>

            <div className="rewards-modal__steps">
              {(activeTask === 'repost' ? ['Open X', 'Repost', 'Submit URL'] : ['Create post', 'Copy link', 'Submit URL']).map((step, index) => (
                <div className="rewards-step" key={step}>
                  <span>0{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>

            <div className="rewards-template">
              <div className="rewards-template__top">
                <span>{activeTask === 'repost' ? 'What to do' : 'Suggested X text'}</span>
                {activeTask === 'post' && (
                  <button
                    className="rewards-btn rewards-btn--soft rewards-btn--icon"
                    type="button"
                    onClick={copyTemplate}
                    aria-label="Copy task template"
                    title="Copy task template">
                    <FaCopy aria-hidden="true" />
                  </button>
                )}
              </div>
              <pre>{activeTemplate}</pre>
            </div>

            <div className="rewards-modal__actions">
              <a className="rewards-btn" href={activeActionUrl} target="_blank" rel="noreferrer">
                <FaExternalLinkAlt aria-hidden="true" /> {activeTaskConfig.action}
              </a>
            </div>

            <form className="rewards-form rewards-modal__form" onSubmit={submitX}>
              {activeTask === 'repost' && (
                <div className="rewards-field">
                  <label htmlFor="x-username">X username</label>
                  <input
                    id="x-username"
                    className="rewards-input"
                    value={xUsername}
                    onChange={(event) => setXUsername(event.target.value)}
                    placeholder="@username"
                    maxLength={15}
                  />
                </div>
              )}

              <div className="rewards-field">
                <label htmlFor="tweet-url">{activeTask === 'repost' ? 'Reposted SmartCup post URL' : 'Published X post URL'}</label>
                <input
                  id="tweet-url"
                  className="rewards-input"
                  value={tweetUrl}
                  onChange={(event) => setTweetUrl(event.target.value)}
                  placeholder="https://x.com/user/status/..."
                />
              </div>

              <button
                className="rewards-btn rewards-btn--submit"
                type="submit"
                disabled={!walletHex || xSubmitting}
              >
                <PiGiftBold aria-hidden="true" /> {xSubmitting ? 'Submitting' : 'Submit X task'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
