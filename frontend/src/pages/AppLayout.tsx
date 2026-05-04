import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { useAccount } from '@gear-js/react-hooks';
import { useOnboarding } from '@/hooks/useOnboarding';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { AppFooter } from '@/components/layout/footer/AppFooter';

export function AppLayout() {
  const { account } = useAccount();
  const onboarding = useOnboarding();
  const showOnboarding = !!account && !onboarding.accepted;

  return (
    <div className="app-layout">
      {showOnboarding && <OnboardingModal onAccept={onboarding.accept} />}
      <Sidebar />
      <div className="app-content">
        <main className="app-main">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
