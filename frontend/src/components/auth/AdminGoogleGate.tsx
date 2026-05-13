import React, { useEffect, useRef, useState } from 'react';
import './admin-google-gate.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const ALLOWED_EMAILS = String(
  import.meta.env.VITE_ADMIN_ALLOWED_EMAILS ?? 'rafael.machtura@gmail.com',
)
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const STORAGE_KEY = 'scl_admin_google_credential';

type GoogleCredentialResponse = {
  credential?: string;
};

type GooglePayload = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  exp?: number;
};

type AdminSession = {
  email: string;
  name?: string;
  picture?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme: string; size: string; text: string; shape: string; width?: number },
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

function decodeJwtPayload(token: string): GooglePayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as GooglePayload;
  } catch {
    return null;
  }
}

function sessionFromCredential(token: string): AdminSession | null {
  const payload = decodeJwtPayload(token);
  const email = payload?.email?.toLowerCase();
  const expiresAt = Number(payload?.exp ?? 0) * 1000;

  if (!email || !payload?.email_verified || !ALLOWED_EMAILS.includes(email)) return null;
  if (!expiresAt || expiresAt <= Date.now()) return null;

  return {
    email,
    name: payload.name,
    picture: payload.picture,
  };
}

function loadGoogleScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Identity script failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity script failed to load'));
    document.head.appendChild(script);
  });
}

export function AdminGoogleGate({ children }: { children: React.ReactNode }) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<AdminSession | null>(() => {
    try {
      const token = localStorage.getItem(STORAGE_KEY);
      return token ? sessionFromCredential(token) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session || !GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google || !buttonRef.current) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            const token = response.credential;
            const nextSession = token ? sessionFromCredential(token) : null;

            if (!token || !nextSession) {
              setError(`Only ${ALLOWED_EMAILS.join(', ')} can access this tool.`);
              return;
            }

            localStorage.setItem(STORAGE_KEY, token);
            setError(null);
            setSession(nextSession);
          },
        });

        buttonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 260,
        });
      })
      .catch(() => setError('Could not load Google sign-in. Please refresh and try again.'));

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.google?.accounts.id.disableAutoSelect();
    setSession(null);
  };

  if (session) {
    return (
      <div className="adminGateShell">
        <div className="adminGateBar">
          <div className="adminGateBar__user">
            {session.picture ? <img src={session.picture} alt="" /> : <span className="adminGateBar__avatar" />}
            <div>
              <span>Admin access</span>
              <strong>{session.email}</strong>
            </div>
          </div>
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <main className="adminGate">
      <section className="adminGateCard">
        <div className="adminGateCard__mark">SCL</div>
        <h1>Fixtures Admin</h1>
        <p>Sign in with the authorized Google account to manage tournament fixtures.</p>

        {GOOGLE_CLIENT_ID ? (
          <div className="adminGateButton" ref={buttonRef} />
        ) : (
          <div className="adminGateNotice">
            Missing <code>VITE_GOOGLE_CLIENT_ID</code>. Add a Google OAuth web client ID in Vercel and redeploy.
          </div>
        )}

        {error ? <div className="adminGateError">{error}</div> : null}

        <div className="adminGateCard__allowed">
          Allowed account: <strong>{ALLOWED_EMAILS.join(', ')}</strong>
        </div>
      </section>
    </main>
  );
}
