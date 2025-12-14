import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

type ExchangeResponse =
  | { success: true; data: { token: string } }
  | { success: false; error: string };

type JwtPayload = {
  role?: string;
  exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const payload = parts[1];
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  try {
    const json = atob(base64 + pad);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

function getValidAuthTokenForRole(expectedRole: 'client' | 'coach') {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  if (payload.role !== expectedRole) return null;
  if (typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) return null;
  }

  return token;
}

async function waitForValidToken(expectedRole: 'client' | 'coach', timeoutMs = 2500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const token = getValidAuthTokenForRole(expectedRole);
    if (token) return token;
    await new Promise((r) => window.setTimeout(r, 75));
  }
  return null;
}

function publicLoginUrl() {
  const host = import.meta.env.VITE_PUBLIC_APP_URL || '';
  if (host) return `${host.replace(/\/+$/, '')}/login`;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3700/login`;
}

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // React StrictMode runs effects twice in dev; avoid consuming the single-use grant twice.
    if (getValidAuthTokenForRole('client')) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const grant = searchParams.get('grant');
    if (!grant) {
      setError('No auth grant provided.');
      return;
    }

    const key = `auth_exchange_started:${grant}`;
    if (sessionStorage.getItem(key) === '1') {
      let cancelled = false;
      (async () => {
        const token = await waitForValidToken('client');
        if (cancelled) return;
        if (token) {
          navigate('/dashboard', { replace: true });
          return;
        }
        setError('Failed to authenticate. Please login again.');
        window.setTimeout(() => {
          window.location.href = publicLoginUrl();
        }, 1500);
      })();
      return () => {
        cancelled = true;
      };
    }

    sessionStorage.setItem(key, '1');

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ grant }),
        });
        const json = (await res.json().catch(() => null)) as ExchangeResponse | null;
        if (!res.ok || !json || !json.success) {
          throw new Error('Failed to authenticate. Please login again.');
        }

        localStorage.setItem('auth_token', json.data.token);
        if (!cancelled) navigate('/dashboard', { replace: true });
      } catch (e) {
        if (cancelled) return;

        // If we already have a valid token (eg. first exchange succeeded but StrictMode reran), continue.
        if (getValidAuthTokenForRole('client')) {
          navigate('/dashboard', { replace: true });
          return;
        }

        setError(e instanceof Error ? e.message : 'Authentication error');
        window.setTimeout(() => {
          window.location.href = publicLoginUrl();
        }, 1500);
      } finally {
        if (!getValidAuthTokenForRole('client')) {
          try {
            sessionStorage.removeItem(key);
          } catch {}
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 520, padding: 24 }}>
          <h1 style={{ margin: 0 }}>Authentication Failed</h1>
          <p style={{ marginTop: 12 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, padding: 24 }}>Authenticating…</div>
    </div>
  );
}
