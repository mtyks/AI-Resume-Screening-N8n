import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type PositionStat } from './api';

/**
 * สถิติรายตำแหน่งที่ใช้ร่วมกันทั้งฝั่ง HR (ป้ายตัวเลขที่เมนู, แจ้งเตือน, หน้าภาพรวม, หน้าเลือกตำแหน่ง)
 * โหลดครั้งเดียวแล้วรีเฟรชทุก 60 วินาที และเมื่อหน้าใดแก้สถานะอ่านแล้ว/ลบ ให้เรียก reload()
 */
interface StatsValue {
  stats: PositionStat[] | null;
  error: string | null;
  loading: boolean;
  unreadTotal: number;
  reload: () => void;
}

const Ctx = createContext<StatsValue | null>(null);
const REFRESH_MS = 60_000;

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<PositionStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    api.positionStats()
      .then((s) => { setStats(s); setError(null); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'โหลดสถิติไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  const value = useMemo(() => ({ stats, error, loading, reload, unreadTotal: (stats ?? []).reduce((a, s) => a + s.unread, 0) }), [stats, error, loading, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStats(): StatsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStats ต้องอยู่ภายใน StatsProvider');
  return v;
}
