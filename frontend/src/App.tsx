import { useEffect, useRef, useState } from 'react';
import { useApi, useAccount } from '@gear-js/react-hooks';
import { useLocation } from 'react-router-dom';
import { ApiLoader } from '@/components';
import { withProviders } from '@/hocs';
import { Routing } from '@/pages';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useWalletProfile } from '@/hooks/useWalletProfile';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import './app-layout.css';

function Component() {
  const { isApiReady } = useApi();
  const { account } = useAccount();
  const { pathname } = useLocation();
  const onboarding = useOnboarding(account?.decodedAddress);
  const {
    displayName,
    isLoading: isProfileLoading,
    isSaving: isProfileSaving,
    save: saveWalletProfile,
  } = useWalletProfile();
  const syncedProfileNicknameRef = useRef<string | null>(null);
  const walletAddress = account?.decodedAddress ?? null;
  const [dismissedOnboardingWallet, setDismissedOnboardingWallet] = useState<string | null>(null);

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
  const isPreviewRoute = previewRoutes.includes(pathname) || previewRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
  const onboardingRoutes = [
    '/all-matches',
    '/all-predictions',
    '/progress',
    '/home',
    '/my-predictions',
    '/leaderboard',
    '/leaderboards',
    '/championship-pick',
  ];
  const onboardingRoutePrefixes = ['/2026worldcup/match/', '/leagues/match/', '/match/', '/predictions/'];
  const isOnboardingRoute = onboardingRoutes.includes(pathname) || onboardingRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
  const showOnboarding =
    !!account &&
    isOnboardingRoute &&
    !isProfileLoading &&
    !onboarding.accepted &&
    dismissedOnboardingWallet !== walletAddress;

  useEffect(() => {
    if (!walletAddress) {
      setDismissedOnboardingWallet(null);
    }
  }, [walletAddress]);

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
    setDismissedOnboardingWallet(null);
  };

  return isAppReady || isPreviewRoute ? (
    <>
      {showOnboarding && (
        <OnboardingModal
          onAccept={handleOnboardingAccept}
          onClose={() => setDismissedOnboardingWallet(walletAddress)}
        />
      )}
      <Routing />
    </>
  ) : (
    <ApiLoader />
  );
}

export const App = withProviders(Component);
