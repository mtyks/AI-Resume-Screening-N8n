import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAsync } from '../lib';
import { useStats } from '../stats';
import type { PositionStat } from '../api';
import { ErrorBox, Loading, PageHead } from '../ui';

type Level = 'ok' | 'warn' | 'bad';
interface Health { level: Level; text: string }

const DAY = 86400000;

/** ประเมินสุขภาพของตำแหน่ง: ปกติ = ไม่แสดงอะไร แสดงเฉพาะข้อที่ต้องดู */
function health(s: PositionStat): Health {
  const processed = s.passed + s.below + s.gate;
  const daysLeft = s.close_at ? Math.ceil((new Date(s.close_at).getTime() - Date.now()) / DAY) : null;
  if (s.failed > 0) return { level: 'bad', text: `สแกนล้มเหลว ${s.failed} คน` };
  if (s.is_active && daysLeft !== null && daysLeft >= 0 && daysLeft <= 2 && s.passed === 0) return { level: 'bad', text: 'ใกล้ปิดรับ ยังไม่มีคนผ่านเกณฑ์' };
  if (s.is_active && processed > 0 && s.passed === 0) return { level: 'warn', text: 'ยังไม่มีคนผ่านเกณฑ์' };
  return { level: 'ok', text: '' };
}

function closeText(s: PositionStat): { text: string; urgent: boolean } {
  if (!s.is_active) return { text: 'ปิดรับแล้ว', urgent: false };
  if (!s.close_at) return { text: 'ไม่กำหนด', urgent: false };
  const d = Math.ceil((new Date(s.close_at).getTime() - Date.now()) / DAY);
  if (d < 0) return { text: 'หมดเวลาแล้ว', urgent: false };
  if (d === 0) return { text: 'วันนี้', urgent: true };
  return { text: `อีก ${d} วัน`, urgent: d <= 3 };
}

function Kpi({ label, value, hint, to, tone }: { label: string; value: string | number; hint?: string; to: string; tone?: 'brand' | 'accent' }) {
  return (
    <Link to={to} className="kpi" aria-label={`${label} ${value}`}>
      <span className="k">{label}</span>
      <span className="v" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</span>
      {hint && <span className="h">{hint}</span>}
    </Link>
  );
}

/** แถบสัดส่วนผลการสแกน: ผ่าน / ต่ำกว่าเกณฑ์ / ไม่ผ่าน Gate / รอ / ล้มเหลว */
function OutcomeBar({ s, height = 10 }: { s: Pick<PositionStat, 'passed' | 'below' | 'gate' | 'pending' | 'failed' | 'total'>; height?: number }) {
  if (s.total === 0) return <span className="muted">—</span>;
  const parts: [string, number, string][] = [
    ['ผ่านเกณฑ์', s.passed, 'var(--accent)'], ['ต่ำกว่าเกณฑ์', s.below, 'var(--warn-bar)'], ['ไม่ผ่าน Gate', s.gate, 'var(--danger-bar)'],
    ['รอประมวลผล', s.pending, 'var(--line)'], ['ล้มเหลว', s.failed, 'var(--muted)']
  ];
  const label = parts.filter((p) => p[1] > 0).map((p) => `${p[0]} ${p[1]}`).join(' · ');
  return (
    <span className="obar" style={{ height }} role="img" aria-label={label} title={label}>
      {parts.map(([n, v, c]) => v > 0 && <span key={n} style={{ width: `${(v / s.total) * 100}%`, background: c }} />)}
    </span>
  );
}

/** กราฟแท่งจิ๋วการกระจายคะแนน 10 ช่วง พร้อมเส้นเกณฑ์ผ่าน */
function Spread({ buckets, threshold }: { buckets: number[]; threshold: number }) {
  const max = Math.max(1, ...buckets);
  const sum = buckets.reduce((a, b) => a + b, 0);
  if (sum === 0) return <span className="muted">—</span>;
  const title = buckets.map((n, i) => `${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${n} คน`).join('\n');
  return (
    <span className="spread" role="img" aria-label={`การกระจายคะแนน เกณฑ์ผ่าน ${threshold}`} title={title}>
      {buckets.map((n, i) => (
        <span key={i} className="bar" style={{ height: `${Math.max(n ? 12 : 4, (n / max) * 100)}%`, background: i * 10 >= threshold ? 'var(--accent)' : 'var(--line-strong, #cfd6d2)' }} />
      ))}
      <span className="thr" style={{ left: `${Math.min(100, threshold)}%` }} />
    </span>
  );
}

export default function Dashboard() {
  const { stats, error, loading } = useStats();
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [sort, setSort] = useState<'urgent' | 'total' | 'unread'>('urgent');
  const hasWaiting = (stats ?? []).some((s) => s.pending > 0);
  const hp = useAsync(() => (hasWaiting ? api.pipelineHealth() : Promise.resolve({ stuck: 0, oldest_minutes: 0 })), [hasWaiting]);

  const all = stats ?? [];
  const rows = all.filter((s) => (scope === 'all' ? true : s.is_active));
  const sum = (f: (s: PositionStat) => number) => rows.reduce((a, s) => a + f(s), 0);

  const total = sum((s) => s.total);
  const processed = sum((s) => s.passed + s.below + s.gate);
  const avg = processed ? rows.reduce((a, s) => a + (s.avg_score ?? 0) * (s.passed + s.below + s.gate), 0) / processed : null;
  const failed = sum((s) => s.failed);
  const pending = sum((s) => s.pending);
  const passed = sum((s) => s.passed);
  const hired = sum((s) => s.hired);

  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'total') return b.total - a.total;
    if (sort === 'unread') return b.unread - a.unread || b.total - a.total;
    return rank[health(a).level] - rank[health(b).level] || Number(a.total === 0) - Number(b.total === 0) || b.unread - a.unread || b.total - a.total;
  });
  const attention = rows.filter((s) => health(s).level !== 'ok').length;

  return (
    <main className="page">
      <PageHead title="ภาพรวม" sub="สิ่งที่ต้องทำก่อน และสุขภาพของแต่ละตำแหน่ง">
        <div className="seg" role="group" aria-label="ขอบเขตตำแหน่ง">
          <button type="button" aria-pressed={scope === 'open'} onClick={() => setScope('open')}>ตำแหน่งที่เปิดรับ</button>
          <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>ทั้งหมด</button>
        </div>
      </PageHead>

      {error && <ErrorBox message={error} />}
      {loading && !stats && <Loading />}

      {stats && (
        <>
          {(hp.data?.stuck ?? 0) > 0 && (
            <div role="alert" className="alert err">ระบบประมวลผลหยุดชะงัก: {hp.data?.stuck} คนรอนานเกิน 15 นาที ตรวจว่าเครื่องที่รัน n8n และ ngrok ยังเปิดอยู่</div>
          )}

          <div className="kpis">
            <Kpi label="ยังไม่อ่าน" value={sum((s) => s.unread)} hint="กดเพื่อเริ่มอ่าน" to="/positions" tone="brand" />
            <Kpi label="ผ่านเกณฑ์" value={passed} hint={processed ? `${Math.round((passed / processed) * 100)}% ของที่สแกนแล้ว` : 'ยังไม่มีผลสแกน'} to="/positions" tone="accent" />
            <Kpi label="รับเข้าทำงาน" value={hired} hint={`จากผู้สมัคร ${total} คน`} to="/positions" />
            <Kpi label="คะแนนเฉลี่ย" value={avg === null ? '—' : avg.toFixed(1)} hint={`จาก ${processed} คนที่สแกนแล้ว`} to="/positions" />
          </div>

          <section className="card dash-sum">
            <div className="dash-sum-head">
              <h2>ผลการสแกนทั้งหมด</h2>
              <span className="muted">{total} คน{attention > 0 ? ` · ต้องดู ${attention} ตำแหน่ง` : ''}</span>
            </div>
            <OutcomeBar s={{ passed, below: sum((s) => s.below), gate: sum((s) => s.gate), pending, failed, total }} height={14} />
            <div className="legend">
              <span><i style={{ background: 'var(--accent)' }} />ผ่านเกณฑ์ {passed}</span>
              <span><i style={{ background: 'var(--warn-bar)' }} />ต่ำกว่าเกณฑ์ {sum((s) => s.below)}</span>
              <span><i style={{ background: 'var(--danger-bar)' }} />ไม่ผ่าน Gate {sum((s) => s.gate)}</span>
              {pending > 0 && <span><i style={{ background: 'var(--line)' }} />รอประมวลผล {pending}</span>}
              {failed > 0 && <span><i style={{ background: 'var(--muted)' }} />ล้มเหลว {failed}</span>}
            </div>
          </section>

          <section className="card" style={{ padding: 0 }}>
            <div className="dash-sum-head" style={{ padding: '18px 20px 6px' }}>
              <h2>สุขภาพรายตำแหน่ง</h2>
              <label className="sortsel">
                <span className="muted">เรียงตาม</span>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="urgent">ต้องดูก่อน</option>
                  <option value="unread">ยังไม่อ่านมากสุด</option>
                  <option value="total">ผู้สมัครมากสุด</option>
                </select>
              </label>
            </div>
            {sorted.length === 0 && <div className="empty">ไม่มีตำแหน่งที่เปิดรับ</div>}
            {sorted.length > 0 && (
              <div className="ptable" role="table" aria-label="สุขภาพรายตำแหน่ง">
                <div className="prow phead" role="row">
                  <span role="columnheader">ตำแหน่ง</span><span role="columnheader">ผู้สมัคร</span>
                  <span role="columnheader">ผลการสแกน</span><span role="columnheader">การกระจายคะแนน</span>
                  <span role="columnheader">เฉลี่ย</span><span role="columnheader">ปิดรับ</span>
                </div>
                {sorted.map((s) => {
                  const h = health(s); const c = closeText(s);
                  return (
                    <Link key={s.job_id} to={`/positions/${s.job_id}`} className="prow" role="row">
                      <span className="pname" role="cell">
                        <b>{s.position_name}</b>
                        {h.level !== 'ok' && <span className={`hdot ${h.level}`}><i aria-hidden="true">{h.level === 'bad' ? '▲' : '●'}</i>{h.text}</span>}
                      </span>
                      <span role="cell" className="num">{s.total}{s.unread > 0 && <small>ใหม่ {s.unread}</small>}</span>
                      <span role="cell"><OutcomeBar s={s} /></span>
                      <span role="cell"><Spread buckets={s.buckets} threshold={s.match_threshold} /></span>
                      <span role="cell" className="num">{s.avg_score ?? '—'}</span>
                      <span role="cell" className={c.urgent ? 'urgent' : 'muted'}>{c.text}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
