import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { AppFooter } from '@/components/layout/footer/AppFooter';

export function AppLayout() {
  return (
    <div className="app-layout">
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
