import { Route, Routes } from 'react-router-dom';
import { Landing } from './landing';
import { Match } from './matchs';
import { Home } from './home';
import { AppLayout } from './AppLayout';
import { MatchesTableComponent } from '@/components/predictions/AllMatchs';
import { QueryBetsByUserComponent } from '@/components/predictions/QueryBetsByUser';
import Leaderboards from '@/components/leaderboard/Leaderboards';
import GovernancePanel from '@/components/dao/GovernancePanel';
import { Simulator } from './simulator';
import { AdminFixtures } from './admin-fixtures';
import TermsOfUse from './legal/TermsOfUse';
import DaoConstitution from './legal/DaoConstitution';
import Rules from './legal/Rules';

function Routing() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* Match routes */}
      <Route path="/2026worldcup/match/:id" element={<Match />} />
      <Route path="/leagues/match/:id" element={<Match />} />
      {/* Legacy redirect kept for backwards compatibility */}
      <Route path="/match/:id" element={<Match />} />
      {/* Legal pages — accessible without auth */}
      <Route path="/terms-of-use" element={<TermsOfUse />} />
      <Route path="/dao-constitution" element={<DaoConstitution />} />
      <Route path="/rules" element={<Rules />} />
      <Route path="/admin/fixtures" element={<AdminFixtures />} />
      <Route element={<AppLayout />}>
        {/* /progress replaces /home */}
        <Route path="/progress" element={<Home />} />
        {/* Keep /home as alias for backwards compat */}
        <Route path="/home" element={<Home />} />
        <Route path="/my-predictions" element={<QueryBetsByUserComponent />} />
        {/* /all-matches replaces /all-predictions */}
        <Route path="/all-matches" element={<MatchesTableComponent />} />
        {/* Keep /all-predictions as alias for backwards compat */}
        <Route path="/all-predictions" element={<MatchesTableComponent />} />
        {/* Primary route — singular */}
        <Route path="/leaderboard" element={<Leaderboards />} />
        {/* Backwards-compat alias */}
        <Route path="/leaderboards" element={<Leaderboards />} />
        <Route path="/dao" element={<GovernancePanel />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/predictions/:wallet" element={<MatchesTableComponent />} />
      </Route>
    </Routes>
  );
}

export { Routing };
