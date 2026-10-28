import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { TONE_COLOR, fmtDuration, pctChange, scoreTone, useAsync } from '../lib';
import { Funnel, InflowChart, ScoreSpread, SkillsChart } from '../dashCharts';
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

function Kpi({ label, value, hint, to, tone, color }: { label: string; value: string | number; hint?: React.ReactNode; to: string; tone?: 'brand' | 'accent'; color?: string }) {
  return (
    <Link to={to} className="kpi" aria-label={`${label} ${value}`}>
      <span className="k">{label}</span>
      <span className="v" style={color ? { color } : tone ? { color: `var(--${tone})` } : undefined}>{value}</span>
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


function Delta({ cur, prev, unit = '%' }: { cur: number | null; prev: number | null; unit?: '%' | 'pt' }) {
  if (cur === null || prev === null) return <span className="muted">ไม่มีข้อมูลช่วงก่อนให้เทียบ</span>;
  const d = unit === '%' ? pctChange(cur, prev) : Math.round((cur - prev) * 10) / 10;
  if (d === null) return <span className="muted">ไม่มีข้อมูลช่วงก่อนให้เทียบ</span>;
  if (d === 0) return <span className="muted">เท่ากับช่วงก่อน</span>;
  return <span className={d > 0 ? 'up' : 'down'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}{unit === '%' ? '%' : ' คะแนน'} จากช่วงก่อน</span>;
}

const RANGES = [7, 30, 90] as const;

export default function Dashboard() {
  const { stats, error, loading } = useStats();
  const [scope, setScope] = useState<'open' | 'all'>('open');
  const [sort, setSort] = useState<'urgent' | 'total' | 'unread'>('urgent');
  const [job, setJob] = useState<string>('');
  const [days, setDays] = useState<number>(30);
  const hasWaiting = (stats ?? []).some((s) => s.pending > 0);
  const hp = useAsync(() => (hasWaiting ? api.pipelineHealth() : Promise.resolve({ stuck: 0, oldest_minutes: 0 })), [hasWaiting]);
  const sum = useAsync(() => api.dashboardSummary(job || null, days), [job, days]);
  const d = sum.data;

  const all = stats ?? [];
  const jobRows = all.filter((s) => (job ? s.job_id === job : scope === 'all' ? true : s.is_active));
  const unread = jobRows.reduce((a, s) => a + s.unread, 0);
  const failed = jobRows.reduce((a, s) => a + s.failed, 0);

  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  const rows = all.filter((s) => (scope === 'all' ? true : s.is_active));
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'total') return b.total - a.total;
    if (sort === 'unread') return b.unread - a.unread || b.total - a.total;
    return rank[health(a).level] - rank[health(b).level] || Number(a.total === 0) - Number(b.total === 0) || b.unread - a.unread || b.total - a.total;
  });
  const attention = rows.filter((s) => health(s).level !== 'ok').length;
  const range = days === 7 ? 'สัปดาห์นี้' : days === 30 ? 'เดือนนี้' : '90 วันนี้';

  return (
    <main className="page">
      <PageHead title="ภาพรวม" sub="สิ่งที่ต้องทำก่อน คุณภาพผู้สมัคร และสถานะการสรรหา" />

      <div className="dfilters">
        <label className="sortsel">
          <span className="muted">ตำแหน่ง</span>
          <select className="select" value={job} onChange={(e) => setJob(e.target.value)} aria-label="กรองตามตำแหน่งงาน">
            <option value="">ทุกตำแหน่ง</option>
            {all.map((s) => <option key={s.job_id} value={s.job_id}>{s.position_name}{s.is_active ? '' : ' (ปิดรับ)'}</option>)}
          </select>
        </label>
        <div className="segbtn" role="group" aria-label="ช่วงเวลา">
          {RANGES.map((r) => <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}>{r} วันล่าสุด</button>)}
        </div>
        {sum.loading && <span className="muted" role="status">กำลังโหลด…</span>}
      </div>

      {error && <ErrorBox message={error} />}
      {sum.error && <ErrorBox message={sum.error} />}
      {loading && !stats && <Loading />}

      {(hp.data?.stuck ?? 0) > 0 && (
        <div role="alert" className="alert err">ระบบประมวลผลหยุดชะงัก: {hp.data?.stuck} คนรอนานเกิน 15 นาที ตรวจว่าเครื่องที่รัน n8n และ ngrok ยังเปิดอยู่</div>
      )}

      {d && (
        <>
          <div className="kpis">
            <Kpi label={`ผู้สมัครที่สแกน (${range})`} value={d.total} hint={<Delta cur={d.total} prev={d.prev_total} />} to="/positions" />
            <Kpi label="คะแนนจับคู่เฉลี่ย" value={d.avg_score === null ? '—' : d.avg_score.toFixed(1)} color={d.avg_score === null ? undefined : TONE_COLOR[scoreTone(d.avg_score)]}
              hint={<Delta cur={d.avg_score} prev={d.prev_avg_score} unit="pt" />} to="/positions" />
            <Kpi label="เวลาสแกนเสร็จ (มัธยฐาน)" value={fmtDuration(d.median_minutes)} hint="นับจากใบสมัครเข้าระบบจนสแกนเสร็จ" to="/positions" />
            <Kpi label="ตำแหน่งที่เปิดรับ" value={d.active_openings} hint={`จากทั้งหมด ${all.length} ตำแหน่ง`} to="/positions" tone="accent" />
          </div>

          {(unread > 0 || failed > 0) && (
            <div className="todo">
              <b>ต้องทำ:</b>
              {unread > 0 && <Link to={job ? `/positions/${job}` : '/positions'}>ยังไม่อ่าน {unread} คน →</Link>}
              {failed > 0 && <Link to={job ? `/positions/${job}` : '/positions'} style={{ color: 'var(--danger-bar)' }}>สแกนล้มเหลว {failed} คน →</Link>}
            </div>
          )}

          <div className="dgrid">
            <section className="card dcard span2">
              <div className="dash-sum-head"><h2>แนวโน้มผู้สมัครรายวัน</h2><span className="muted">{d.days} วันล่าสุด · รวม {d.total} คน</span></div>
              <InflowChart data={d.inflow} />
            </section>
            <section className="card dcard">
              <div className="dash-sum-head"><h2>สถานะการสรรหา (Funnel)</h2></div>
              <Funnel f={d.funnel} />
              <p className="muted fhint">ระบบยังไม่มีสถานะ "นัดสัมภาษณ์/Offer" จึงแสดงถึงขั้นรับเข้าทำงาน</p>
            </section>
            <section className="card dcard">
              <div className="dash-sum-head"><h2>การกระจายคะแนนจับคู่</h2></div>
              <ScoreSpread buckets={d.buckets} />
            </section>
            <section className="card dcard span2">
              <div className="dash-sum-head"><h2>ทักษะที่พบบ่อยที่สุด</h2><span className="muted">จำนวนผู้สมัครที่พบทักษะนั้น</span></div>
              <SkillsChart data={d.skills} total={d.total} />
            </section>
          </div>
        </>
      )}

      {stats && (
        <section className="card" style={{ padding: 0 }}>
          <div className="dash-sum-head" style={{ padding: '18px 20px 6px' }}>
            <h2>สุขภาพรายตำแหน่ง{attention > 0 ? ` · ต้องดู ${attention}` : ''}</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="segbtn" role="group" aria-label="ขอบเขตตำแหน่ง">
                <button type="button" aria-pressed={scope === 'open'} onClick={() => setScope('open')}>เปิดรับ</button>
                <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>ทั้งหมด</button>
              </div>
              <label className="sortsel">
                <span className="muted">เรียงตาม</span>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="urgent">ต้องดูก่อน</option>
                  <option value="unread">ยังไม่อ่านมากสุด</option>
                  <option value="total">ผู้สมัครมากสุด</option>
                </select>
              </label>
            </div>
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
                    <span role="cell" className="num" style={s.avg_score !== null ? { color: TONE_COLOR[scoreTone(s.avg_score)] } : undefined}>{s.avg_score ?? '—'}</span>
                    <span role="cell" className={c.urgent ? 'urgent' : 'muted'}>{c.text}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
