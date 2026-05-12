import { useApi, useAccount } from '@gear-js/react-hooks';
import { ApiLoader } from '@/components';
import { withProviders } from '@/hocs';
import { Routing } from '@/pages';
import './app-layout.css';

function Component() {
  const { isApiReady } = useApi();
  useAccount();

  const isAppReady = isApiReady;
  const previewRoutes = ['/', '/all-matches', '/progress', '/leaderboard', '/championship-pick'];
  const isPreviewRoute = previewRoutes.includes(window.location.pathname);

  return isAppReady || isPreviewRoute ? <Routing /> : <ApiLoader />;
}

export const App = withProviders(Component);
