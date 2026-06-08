import { useEffect, useState } from 'react';
import { authMeCached } from '../multitenant/api';

type AccountManager = {
  id: string;
  name: string;
  surname?: string | null;
  email: string;
  phone?: string | null;
  telegram?: string | null;
  signalUsername?: string | null;
};

export function AccountManagerCard() {
  const [am, setAm] = useState<AccountManager | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The session cookie is HttpOnly, so JS can't pre-flight; just call
    // authMe and rely on the browser to attach the cookie when present.
    // authMeCached shares one round-trip with the gate and reader chrome.
    (async () => {
      try {
        const data = await authMeCached();
        if (cancelled) return;
        if (data?.user?.accountManager) setAm(data.user.accountManager);
      } catch {
        /* not authed via v2 — leave am null */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !am) return null;

  const fullName = [am.name, am.surname].filter(Boolean).join(' ');
  const initial = (am.name || am.email || '?').charAt(0).toUpperCase();

  return (
    <section className="account-manager-card" aria-label="Account manager">
      <div className="am-label">Your account manager</div>
      <div className="am-head">
        <span className="am-avatar" aria-hidden="true">{initial}</span>
        <div className="am-identity">
          <div className="am-name">{fullName || am.email}</div>
          {fullName ? <div className="am-email">{am.email}</div> : null}
        </div>
      </div>
      <ul className="am-contacts">
        <li><a href={`mailto:${am.email}`}>{am.email}</a></li>
        {am.phone ? <li><a href={`tel:${am.phone.replace(/[^+\d]/g, '')}`}>{am.phone}</a></li> : null}
        {am.telegram ? <li><a href={`https://t.me/${am.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Telegram @{am.telegram.replace(/^@/, '')}</a></li> : null}
        {am.signalUsername ? <li>Signal: {am.signalUsername}</li> : null}
      </ul>
    </section>
  );
}
