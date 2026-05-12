export interface DaoProposal {
  id: string;
  title: string;
  meta: string;
}

export const daoProposals: DaoProposal[] = [
  {
    id: 'p1',
    title: 'Reduce fee from 5% to 4.5%',
    meta: 'Ends in 18h · Quorum 62%',
  },
  {
    id: 'p2',
    title: 'Add AFC Asian Cup 2027',
    meta: 'Ends in 2d · Quorum 38%',
  },
];

export const FINAL_PRIZE_POOL_BTC = 9.12;
export const USER_VOTING_POWER = 3420;
