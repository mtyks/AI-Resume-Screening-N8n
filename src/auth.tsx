import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, isReal } from './api';
import type { Role } from './api';

interface Session {
  email: string;
  role: Role;
}

interface AuthValue {
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => void;
}

const KEY = 'rs-session-v1';
/** ตั้งไว้ก่อนพาไปหน้า Google เพื่อให้รู้ว่าการโหลดหน้านี้คือการกลับมาจากล็อกอิน */
export const OAUTH_FLAG = 'rs-oauth-return';
const Ctx = createContext<AuthValue | null>(null);

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // โหมดจริง: รอตรวจ session จาก Supabase ก่อนตัดสินว่าต้องเด้งไปหน้าเข้าสู่ระบบหรือไม่
  const [session, setSession] = useState<Session | null>(isReal ? null : readSession);
  const [ready, setReady] = useState(!isReal);

  useEffect(() => {
    if (!isReal) return;
    api
      .restoreSession()
      .catch(() => null)
      .then((s) => {
        setSession(s);
        // กลับมาจากหน้า Google: Supabase ส่งกลับมาที่ "/" (ไม่มี #/ ของ HashRouter) จึงต้องพาไปหน้าที่ถูกต้องเอง
        let back = false;
        try {
          back = sessionStorage.getItem(OAUTH_FLAG) === '1';
          sessionStorage.removeItem(OAUTH_FLAG);
        } catch {
          /* ignore */
        }
        if (back) {
          window.history.replaceState(null, '', window.location.pathname + (s ? '#/dashboard' : '#/login')); // ตัด ?code=… ออกด้วย
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      })
      .finally(() => setReady(true));
  }, []);

  const signInGoogle = useCallback(async () => {
    try {
      sessionStorage.setItem(OAUTH_FLAG, '1');
    } catch {
      /* ignore */
    }
    try {
      await api.signInGoogle();
    } catch (e) {
      try {
        sessionStorage.removeItem(OAUTH_FLAG);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const s = await api.signIn(email, password);
    setSession(s);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ไม่เก็บ session ก็ใช้งานต่อได้ */
    }
  }, []);

  const signOut = useCallback(() => {
    void api.signOut();
    setSession(null);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ session, ready, signIn, signInGoogle, signOut }), [session, ready, signIn, signInGoogle, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth ต้องอยู่ภายใน AuthProvider');
  return v;
}

/** ครอบหน้าที่ต้องเข้าสู่ระบบ ถ้ากำหนด roles จะจำกัดตามบทบาท */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { session, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div style={{ padding: 48 }}>กำลังตรวจสอบสิทธิ์…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(session.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
