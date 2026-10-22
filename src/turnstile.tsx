import { useEffect, useRef } from 'react';

/** Cloudflare Turnstile (ฟรี) แสดงเฉพาะเมื่อกำหนด VITE_TURNSTILE_SITE_KEY ตอน build ถ้าไม่กำหนดจะไม่แสดงอะไร */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let id: string | undefined;
    let dead = false;
    loadScript().then(() => {
      if (dead || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken('')
      });
    }).catch(() => onToken(''));
    return () => { dead = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [onToken]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} />;
}
