import { useEffect, useRef, useState } from 'react';
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
  const {
    displayName,
    isLoading: isProfileLoading,
    isSaving: isProfileSaving,
    save: saveWalletProfile,
  } = useWalletProfile();
  const [onboardingRequested, setOnboardingRequested] = useState(false);
  const syncedProfileNicknameRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!account || !onboarding.accepted || !onboarding.nickname || displayName || isProfileLoading || isProfileSaving) {
      return;
    }

    const syncKey = `${account.decodedAddress}:${onboarding.nickname}`;
    if (syncedProfileNicknameRef.current === syncKey) return;
    syncedProfileNicknameRef.current = syncKey;

    void saveWalletProfile(onboarding.nickname);
  }, [
    account,
    displayName,
    isProfileLoading,
    isProfileSaving,
    onboarding.accepted,
    onboarding.nickname,
    saveWalletProfile,
  ]);

  const handleOnboardingAccept = async (nickname: string) => {
    const trimmed = nickname.trim();
    if (trimmed) {
      const saved = await saveWalletProfile(trimmed);
      if (!saved) {
        throw new Error('Could not save your nickname. Please try again.');
      }
    }

    onboarding.accept(trimmed);
    setOnboardingRequested(false);
  };

  return isAppReady || isPreviewRoute ? (
    <>
      {showOnboarding && (
        <OnboardingModal
          onAccept={handleOnboardingAccept}
          onClose={() => setOnboardingRequested(false)}
        />
      )}
      <Routing />
    </>
  ) : (
    <ApiLoader />
  );
}

export const App = withProviders(Component);
