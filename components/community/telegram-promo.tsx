'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, X } from 'lucide-react';
import styles from './telegram-promo.module.css';

const STORAGE_KEY = 'polka.community.telegram.v1';
const DISMISS_FOR = 30 * 24 * 60 * 60 * 1000;
const SHOW_AFTER = 12_000;
const RETRY_AFTER = 2_000;

function safeToShow() {
  if (document.visibilityState !== 'visible') return false;
  if (!['/', '/pricing'].includes(window.location.pathname)) return false;
  if (new URLSearchParams(window.location.search).get('page') === 'assistant') return false;
  if (document.querySelector('dialog[open], .workspace-chat, .quiz-card')) return false;
  const active = document.activeElement;
  return !(active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

/** A quiet invitation: no focus capture, remote embeds, or analytics. */
export function TelegramPromo() {
  const pathname = usePathname();
  const headingId = useId();
  const dismissed = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    if (dismissed.current || !['/', '/pricing'].includes(pathname)) return;
    try {
      const until = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(until) && until > Date.now()) {
        dismissed.current = true;
        return;
      }
    } catch {
      // The ref still remembers dismissal when browser storage is unavailable.
    }

    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (dismissed.current) return;
      setVisible(safeToShow());
      timer = setTimeout(check, RETRY_AFTER);
    };
    timer = setTimeout(check, SHOW_AFTER);
    return () => clearTimeout(timer);
  }, [pathname]);

  function dismiss() {
    dismissed.current = true;
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_FOR));
    } catch {
      // Browsing the app remains possible without storage permissions.
    }
  }

  if (!visible || !['/', '/pricing'].includes(pathname)) return null;

  return (
    <aside
      className={styles.card}
      aria-labelledby={headingId}
      data-telegram-promo
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <div className={styles.identity}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="m20.5 4-3.1 15c-.2 1-1 1.2-1.8.7l-4.7-3.5-2.3 2.2c-.3.3-.5.5-.9.5l.3-4.9 8.9-8c.4-.3-.1-.5-.5-.2l-11 6.9-4.7-1.5c-1-.3-1-1 .2-1.4L19.2 3c.8-.3 1.5.2 1.3 1Z" fill="currentColor" /></svg>
        </span>
        <span>polka <span className={styles.channel}>в Telegram</span></span>
      </div>
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Не показывать приглашение в Telegram 30 дней"><X size={17} aria-hidden="true" /></button>
      <h2 id={headingId}>Есть жизнь после лекций.</h2>
      <p>Канал polka об учёбе и карьере.<br />Загляните, если это вам близко.</p>
      <a className={styles.link} href="https://t.me/polka_it" target="_blank" rel="noopener noreferrer" onClick={dismiss}>
        Открыть канал <ArrowUpRight size={17} aria-hidden="true" />
      </a>
      <span className={styles.handle}>@polka_it</span>
    </aside>
  );
}
