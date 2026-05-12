import { useEffect, useState } from 'react';
import { useApi, useAccount } from '@gear-js/react-hooks';
import { ApiLoader } from '@/components';
import { withProviders } from '@/hocs';
import { Routing } from '@/pages';
import { ONBOARDING_CONNECT_EVENT, useOnboarding } from '@/hooks/useOnboarding';
import { useWalletProfile } from '@/hooks/useWalletProfile';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import './app-layout.css';

function Component() {
  const { isApiReady } = useApi();
  const { account } = useAccount();
  const onboarding = useOnboarding(account?.decodedAddress);
  const { save: saveWalletProfile } = useWalletProfile();
  const [onboardingRequested, setOnboardingRequested] = useState(false);

  const isAppReady = isApiReady;
  const previewRoutes = [
    '/',
    '/all-matches',
    '/all-predictions',
    '/progress',
    '/home',
    '/my-predictions',
    '/leaderboard',
    '/leaderboards',
    '/championship-pick',
    '/simulator',
    '/terms-of-use',
    '/dao-constitution',
    '/rules',
    '/admin/fixtures',
  ];
  const previewRoutePrefixes = ['/2026worldcup/match/', '/leagues/match/', '/match/', '/predictions/'];
  const pathname = window.location.pathname;
  const isPreviewRoute = previewRoutes.includes(pathname) || previewRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
  const onboardingExemptRoutes = ['/terms-of-use', '/dao-constitution', '/rules'];
  const isOnboardingExemptRoute = onboardingExemptRoutes.includes(pathname);
  const showOnboarding = !!account && onboardingRequested && !onboarding.accepted && !isOnboardingExemptRoute;

  useEffect(() => {
    const requestOnboarding = () => setOnboardingRequested(true);
    window.addEventListener(ONBOARDING_CONNECT_EVENT, requestOnboarding);
    return () => window.removeEventListener(ONBOARDING_CONNECT_EVENT, requestOnboarding);
  }, []);

  useEffect(() => {
    if (!account || onboarding.accepted) setOnboardingRequested(false);
  }, [account, onboarding.accepted]);

  const handleOnboardingAccept = async (nickname: string) => {
    const trimmed = nickname.trim();
    if (trimmed) {
      await saveWalletProfile(trimmed);
    }
    onboarding.accept(trimmed);
    setOnboardingRequested(false);
  };

  return isAppReady || isPreviewRoute ? (
    <>
      {showOnboarding && <OnboardingModal onAccept={handleOnboardingAccept} />}
      <Routing />
    </>
  ) : (
    <ApiLoader />
  );
}

export const App = withProviders(Component);
