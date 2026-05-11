import { useApi, useAccount } from '@gear-js/react-hooks';
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
  const onboarding = useOnboarding();
  const { save: saveWalletProfile } = useWalletProfile();

  const isAppReady = isApiReady;
  const isPublicLanding = window.location.pathname === '/';
  const showOnboarding = !!account && !onboarding.accepted;

  const handleOnboardingAccept = async (nickname: string) => {
    const trimmed = nickname.trim();
    if (trimmed) {
      await saveWalletProfile(trimmed);
    }
    onboarding.accept(trimmed);
  };

  return isAppReady || isPublicLanding ? (
    <>
      {showOnboarding && <OnboardingModal onAccept={handleOnboardingAccept} />}
      <Routing />
    </>
  ) : (
    <ApiLoader />
  );
}

export const App = withProviders(Component);
