import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { AppFooter } from '@/components/layout/footer/AppFooter';
import { MobileTabBar } from '@/components/layout/mobile-nav';

const ROUTE_SCROLL_PREFIX = 'smartcup:route-scroll:';

function scrollStorageKey(pathname: string) {
  return `${ROUTE_SCROLL_PREFIX}${pathname}`;
}

function readStoredScroll(pathname: string) {
  try {
    const raw = sessionStorage.getItem(scrollStorageKey(pathname));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredScroll(pathname: string, value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  try {
    sessionStorage.setItem(scrollStorageKey(pathname), String(Math.round(value)));
  } catch {
    // Session storage can be unavailable in some privacy modes. Scroll memory is a progressive enhancement.
  }
}

function getScrollState(main: HTMLElement | null) {
  if (!main) return { target: window, top: window.scrollY, usesWindow: true as const };

  const style = window.getComputedStyle(main);
  const canScrollMain = style.overflowY !== 'visible' && main.scrollHeight > main.clientHeight;
  if (!canScrollMain) return { target: window, top: window.scrollY, usesWindow: true as const };

  return { target: main, top: main.scrollTop, usesWindow: false as const };
}

function restoreScroll(main: HTMLElement | null, top: number) {
  const state = getScrollState(main);
  if (state.usesWindow) {
    window.scrollTo({ top, left: 0, behavior: 'auto' });
    return;
  }
  state.target.scrollTo({ top, left: 0, behavior: 'auto' });
}

export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const routeKey = useMemo(() => pathname, [pathname]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const storedTop = readStoredScroll(routeKey);
    const timers: number[] = [];

    const restore = () => restoreScroll(main, storedTop);
    requestAnimationFrame(restore);
    timers.push(window.setTimeout(restore, 80));
    timers.push(window.setTimeout(restore, 250));
    timers.push(window.setTimeout(restore, 650));

    return () => {
      const state = getScrollState(main);
      writeStoredScroll(routeKey, state.top);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [routeKey]);

  useEffect(() => {
    let frame = 0;

    const save = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const state = getScrollState(mainRef.current);
        writeStoredScroll(routeKey, state.top);
      });
    };

    const state = getScrollState(mainRef.current);
    state.target.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);

    return () => {
      state.target.removeEventListener('scroll', save);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('beforeunload', save);
      if (frame) window.cancelAnimationFrame(frame);
      writeStoredScroll(routeKey, getScrollState(mainRef.current).top);
    };
  }, [routeKey]);

  return (
    <div className="scb-app-layout">
      <Sidebar />
      <div className="scb-app-content">
        <main className="scb-app-main" ref={mainRef}>
          <Outlet />
        </main>
        <AppFooter />
      </div>
      <MobileTabBar />
    </div>
  );
}
