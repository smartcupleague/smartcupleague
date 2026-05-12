import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '@gear-js/react-hooks';
import { useToast } from '@/hooks/useToast';
import { web3Enable } from '@polkadot/extension-dapp';
import { Program, Service } from '@/hocs/dao';

const PROGRAM_ID = import.meta.env.VITE_DAOPROGRAM as `0x${string}`;

type DaoProposal = {
  id: number;
  proposer: `0x${string}`;
  kind: Record<string, any>;
  description: string;
  start_time: number; // ms
  end_time: number; // ms
  yes: number;
  no: number;
  abstain: number;
  status: string;
  executed: boolean;
};

type UiStatus = 'Passed' | 'Active' | 'Failed';

type ProposalUI = {
  id: number;
  title: string;
  author: string;
  timeAgo: string;
  description: string;
  status: UiStatus;
  endingIn: string;
  quorumLabel: string;
  yesPct: number; // 0..100
  yesPower: number;
  noPower: number;
  optionYesLabel: string;
  optionNoLabel: string;
};

const formatPower = (n: number) => n.toLocaleString('en-US');

function shortHex(addr: string) {
  if (!addr) return '-';
  return addr.slice(0, 7) + '…' + addr.slice(-4);
}

function toUiStatus(p: DaoProposal): UiStatus {
  const s = (p.status ?? '').toLowerCase();
  if (s === 'active') return 'Active';
  if (p.executed || s === 'executed' || s === 'succeeded' || s === 'passed') return 'Passed';
  if (s === 'defeated' || s === 'expired' || s === 'failed') return 'Failed';

  if (Date.now() > Number(p.end_time || 0) && s !== 'active') return 'Passed';
  return 'Active';
}

function formatTimeAgo(ms: number) {
  if (!ms) return '-';
  const diff = Date.now() - ms;
  if (diff < 0) return 'in the future';

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day > 0) return `${day} day${day === 1 ? '' : 's'} ago`;
  if (hr > 0) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  if (min > 0) return `${min} minute${min === 1 ? '' : 's'} ago`;
  return `${sec} second${sec === 1 ? '' : 's'} ago`;
}

function formatEndingIn(endMs: number) {
  if (!endMs) return '-';
  const diff = endMs - Date.now();
  if (diff <= 0) return 'ended';

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day > 0) return `${day}d`;
  if (hr > 0) return `${hr}h`;
  return `${Math.max(1, min)}m`;
}

function getKindTitle(kind: Record<string, any>): string {
  if (!kind || typeof kind !== 'object') return 'Proposal';
  const key = Object.keys(kind)[0];
  switch (key) {
    case 'addMatch':
      return 'Add Match';
    case 'addPhase':
      return 'Add Phase';
    case 'setVotingPeriod':
      return 'Set Voting Period';
    case 'setFeeBps':
      return 'Set Fee (BPS)';
    case 'setFinalPrizeBps':
      return 'Set Final Prize (BPS)';
    case 'setMaxPayoutChunk':
      return 'Set Max Payout Chunk';
    case 'setQuorum':
      return 'Set Quorum (BPS)';
    default:
      return key;
  }
}

function toUI(p: DaoProposal): ProposalUI {
  const totalVotes = (p.yes ?? 0) + (p.no ?? 0) + (p.abstain ?? 0);
  const yesPct = totalVotes > 0 ? (p.yes / totalVotes) * 100 : 0;

  return {
    id: p.id,
    title: getKindTitle(p.kind),
    author: shortHex(p.proposer),
    timeAgo: formatTimeAgo(Number(p.start_time)),
    description: p.description,
    status: toUiStatus(p),
    endingIn: formatEndingIn(Number(p.end_time)),
    quorumLabel: 'Quorum: N/A (not exposed)',
    yesPct,
    yesPower: p.yes ?? 0,
    noPower: p.no ?? 0,
    optionYesLabel: 'Yes',
    optionNoLabel: 'No',
  };
}

export default function Overview() {
  const { api, isApiReady } = useApi();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'Ending Soonest' | 'Newest'>('Ending Soonest');
  const [excludeFinalized, setExcludeFinalized] = useState(true);

  const [loading, setLoading] = useState(false);
  const [proposalsRaw, setProposalsRaw] = useState<DaoProposal[] | null>(null);

  useEffect(() => {
    void web3Enable('DAO Governance Overview');
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!api || !isApiReady) return;
    setLoading(true);
    try {
      const svc = new Service(new Program(api, PROGRAM_ID));
      const data = (await (svc as any).queryProposals()) as DaoProposal[];
      setProposalsRaw(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProposalsRaw([]);
      toast.error('Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  }, [api, isApiReady, toast]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  const proposals = useMemo(() => (proposalsRaw ?? []).map(toUI), [proposalsRaw]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = proposals.filter((p) => {
      const matches =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        String(p.id).includes(q);

      if (!matches) return false;
      if (excludeFinalized && (p.status === 'Passed' || p.status === 'Failed')) return false;
      return true;
    });

    list =
      sortBy === 'Ending Soonest'
        ? [...list].sort((a, b) => a.endingIn.localeCompare(b.endingIn))
        : [...list].sort((a, b) => b.id - a.id);

    return list;
  }, [search, sortBy, excludeFinalized, proposals]);

  const stats = useMemo(() => {
    const raw = proposalsRaw ?? [];

    const activeCount = raw.filter((p) => (p.status ?? '').toLowerCase() === 'active').length;

    const uniqueWallets = new Set<string>();
    raw.forEach((p) => {
      if (p.proposer) uniqueWallets.add(p.proposer.toLowerCase());
    });

    const totalVotes = raw.reduce((acc, p) => acc + (p.yes ?? 0) + (p.no ?? 0) + (p.abstain ?? 0), 0);

    return {
      participation: uniqueWallets.size,
      activeCount,
      totalVotes,
    };
  }, [proposalsRaw]);

  return (
    <>
      {/* Filters */}
      <div className="gov__filters">
        <div className="gov__chips">
          <button className="gov__chip" type="button">
            <span className="gov__chipIcon">⚡</span> Set Fee <span className="gov__chev">▾</span>
          </button>
          <button className="gov__chip" type="button">
            <span className="gov__chipIcon">✦</span> Add Match <span className="gov__chev">▾</span>
          </button>
          <button className="gov__chip" type="button">
            <span className="gov__chipIcon">⇄</span> Voting Period <span className="gov__chev">▾</span>
          </button>

          <div className="gov__sort">
            <span className="gov__sortLabel">Sort by</span>
            <button
              className="gov__chip gov__chip--soft"
              type="button"
              onClick={() => setSortBy((s) => (s === 'Ending Soonest' ? 'Newest' : 'Ending Soonest'))}
              title="Toggle sort">
              {sortBy} <span className="gov__chev">▾</span>
            </button>
          </div>

          <button className="gov__chip gov__chip--soft" type="button" onClick={fetchProposals}>
            ↻ Refresh
          </button>
        </div>

        <div className="gov__filtersRight">
          <label className="gov__toggle">
            <input type="checkbox" checked={excludeFinalized} onChange={(e) => setExcludeFinalized(e.target.checked)} />
            <span className="gov__toggleUi" />
            <span className="gov__toggleText">Exclude finalized proposals</span>
          </label>

          <div className="gov__searchVoting">
            <span className="gov__icon">⌕</span>
            <input
              className="gov__input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search proposals for voting..."
            />
          </div>
        </div>
      </div>

      <section className="gov__section">
        <div className="gov__sectionTitle">Active Proposals</div>

        <div className="gov__stats">
          <div className="gov__statCard">
            <div className="gov__statHeader">
              <div className="gov__statIcon">🏛️</div>
              <div className="gov__statName">Participation</div>
            </div>
            <div className="gov__statValueRow">
              <div className="gov__statValue">{proposalsRaw ? stats.participation : '—'}</div>
              <div className="gov__statMeta">
                <span className="gov__statMetaChip">Unique proposers</span>
                <span className="gov__statMetaChip">{loading ? 'Syncing…' : 'On-chain'}</span>
              </div>
            </div>
            <button className="gov__ghostBtn" type="button" onClick={fetchProposals}>
              Refresh <span className="gov__chev">›</span>
            </button>
          </div>

          <div className="gov__statCard">
            <div className="gov__statHeader">
              <div className="gov__statIcon">🏆</div>
              <div className="gov__statName">Active Proposals</div>
            </div>
            <div className="gov__statValueRow">
              <div className="gov__statValue">{proposalsRaw ? stats.activeCount : '—'}</div>
              <div className="gov__statMeta">
                <span className="gov__statMetaSub">From queryProposals()</span>
              </div>
            </div>
            <button className="gov__ghostBtn" type="button">
              View All Proposals <span className="gov__chev">›</span>
            </button>
          </div>

          <div className="gov__statCard">
            <div className="gov__statHeader">
              <div className="gov__statIcon">🪙</div>
              <div className="gov__statName">Voting Power</div>
            </div>
            <div className="gov__statValueRow">
              <div className="gov__statValue">{proposalsRaw ? formatPower(stats.totalVotes) : '—'}</div>
              <div className="gov__statMeta">
                <span className="gov__statMetaChip">Total votes</span>
                <span className="gov__statMetaChip">Yes/No/Abstain</span>
              </div>
            </div>
            <div className="gov__statMetaSub">Power not exposed → showing total votes as on-chain metric.</div>
            <button className="gov__ghostBtn" type="button">
              View My Proposals <span className="gov__chev">›</span>
            </button>
          </div>
        </div>
      </section>

      {/* Proposals list */}
      <section className="gov__section">
        <div className="gov__listHeader">
          <div className="gov__sectionTitle">Proposals</div>
          <div className="gov__listMeta">
            <span className="gov__dot ok" /> chain: OK
            <span className="gov__sep" />
            <span className="gov__dot" /> Quorum: N/A
            <span className="gov__sep" />
            Votes tracked on-chain
          </div>
        </div>

        <div className="gov__list">
          {loading && <div className="gov__empty">Loading on-chain proposals…</div>}

          {!loading &&
            filtered.map((p) => (
              <article key={p.id} className="gov__proposal">
                <div className="gov__proposalLeft">
                  <div className="gov__proposalTop">
                    <div className="gov__proposalBadge" aria-hidden="true">
                      🏛️
                    </div>
                    <div>
                      <div className="gov__proposalTitle">
                        Proposal #{p.id} - {p.title}
                      </div>
                      <div className="gov__proposalSub">
                        {p.timeAgo} by <span className="gov__mono">{p.author}</span>
                      </div>
                    </div>
                  </div>

                  <div className="gov__proposalDesc">{p.description}</div>

                  <div className="gov__proposalFooter">
                    <span
                      className={`gov__status ${
                        p.status === 'Passed' ? 'is-passed' : p.status === 'Failed' ? 'is-failed' : 'is-active'
                      }`}>
                      {p.status}
                    </span>
                    <span className="gov__powerPill">
                      <span className="gov__tinyIcon">⚡</span> {formatPower(p.yesPower + p.noPower)} Votes
                    </span>
                  </div>
                </div>

                <div className="gov__proposalRight">
                  <div
                    className="gov__pie"
                    style={{ ['--yes' as any]: `${p.yesPct}%` } as React.CSSProperties}
                    aria-label={`Yes ${p.yesPct} percent`}
                    title={`Yes ${p.yesPct.toFixed(1)}%`}>
                    <div className="gov__pieInner">
                      <div className="gov__pieYes">{p.yesPct.toFixed(1)}%</div>
                      <div className="gov__piePower">{formatPower(p.yesPower)} Yes</div>
                    </div>
                  </div>

                  <div className="gov__voteInfo">
                    <div className="gov__voteTop">
                      <div className="gov__ending">Ending in {p.endingIn}</div>
                      <div className="gov__quorum">{p.quorumLabel}</div>
                    </div>

                    <div className="gov__voteRows">
                      <div className="gov__voteRow">
                        <span className="gov__voteDot yes" />
                        <span className="gov__voteLabel">{p.optionYesLabel}</span>
                        <span className="gov__votePower">{formatPower(p.yesPower)} votes</span>
                      </div>
                      <div className="gov__voteRow">
                        <span className="gov__voteDot no" />
                        <span className="gov__voteLabel">{p.optionNoLabel}</span>
                        <span className="gov__votePower">{formatPower(p.noPower)} votes</span>
                      </div>
                    </div>

                    <div className="gov__proposalActions">
                      <button className="gov__btn gov__btn--soft" type="button">
                        Details <span className="gov__chev">▾</span>
                      </button>
                      <button className="gov__btn gov__btn--primary" type="button">
                        Vote Now <span className="gov__chev">›</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}

          {!loading && proposalsRaw && filtered.length === 0 && (
            <div className="gov__empty">No proposals match your filters.</div>
          )}
        </div>
      </section>
    </>
  );
}
