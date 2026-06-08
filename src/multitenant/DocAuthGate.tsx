import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authMeCached, invalidateAuthSession, ApiError } from './api';
import { auth } from '../storage';

type Phase = 'checking' | 'authorized' | 'denied' | 'error';

export default function DocAuthGate({
  children,
  loginPath = '/admin/v2/login',
  resolveLoginPath,
}: {
  children: ReactNode;
  loginPath?: string;
  /** Resolve the tenant login path lazily — called only when access is
   *  actually denied, so authorized visits pay no extra request. Resolving
   *  to null falls back to `loginPath`. */
  resolveLoginPath?: () => Promise<string | null>;
}) {
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>('checking');
  const [attempt, setAttempt] = useState(0);
  const [resolvedLogin, setResolvedLogin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Legacy admin localStorage session = allow (preserves existing CMS workflow)
    if (auth.isLoggedIn()) {
      setPhase('authorized');
      return;
    }

    // The session cookie is HttpOnly so JS can't read it. Make the authMe
    // call unconditionally — the browser will attach the cookie if present.
    // authMeCached retries transient network failures internally; only an
    // actual 401 answer from the server means "denied". Anything else gets
    // a retry UI instead of a bounce to login (the bounce was the flaky
    // deep-link bug: a network race read as "no session").
    authMeCached()
      .then(() => {
        if (!cancelled) setPhase('authorized');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          if (resolveLoginPath) {
            resolveLoginPath()
              .catch(() => null)
              .then((path) => {
                if (cancelled) return;
                setResolvedLogin(path);
                setPhase('denied');
              });
          } else {
            setPhase('denied');
          }
        } else {
          setPhase('error');
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, attempt]);

  if (phase === 'checking') {
    return (
      <main className="doc-auth-gate-loading">
        <p>Checking access…</p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="doc-auth-gate-loading">
        <p>Couldn&apos;t verify your access — check your connection.</p>
        <button
          type="button"
          onClick={() => {
            invalidateAuthSession();
            setPhase('checking');
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </button>
      </main>
    );
  }

  if (phase === 'denied') {
    const login = resolvedLogin ?? loginPath;
    const target = `${location.pathname}${location.search}${location.hash}`;
    const sep = login.includes('?') ? '&' : '?';
    return (
      <Navigate
        to={`${login}${sep}returnTo=${encodeURIComponent(target)}`}
        replace
      />
    );
  }

  return <>{children}</>;
}
