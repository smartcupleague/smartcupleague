import { useApi, useAccount } from '@gear-js/react-hooks';
import { ApiLoader } from '@/components';
import { withProviders } from '@/hocs';
import { Routing } from '@/pages';
import './app-layout.css';

function Component() {
  const { isApiReady } = useApi();
  useAccount();

  const isAppReady = isApiReady;
  const isPublicLanding = window.location.pathname === '/';

  return isAppReady || isPublicLanding ? <Routing /> : <ApiLoader />;
}

export const App = withProviders(Component);
