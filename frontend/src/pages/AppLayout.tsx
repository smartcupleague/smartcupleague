import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import { MobileTabBar } from '@/components/layout/mobile-nav';

export function AppLayout() {
  return (
    <div className="scb-app-layout">
      <Sidebar />
      <div className="scb-app-content">
        <main className="scb-app-main">
          <Outlet />
        </main>
        <AppFooter />
      </div>
      <MobileTabBar />
    </div>
  );
}
