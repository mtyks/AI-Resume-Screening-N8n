import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TONE_COLOR, scoreTone } from './lib';
import type { DashboardSummary, PositionReadStat } from './api';

const fmtDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

/** กราฟเส้นแนวโน้มผู้สมัครรายวัน (SVG ล้วน ไม่ต้องใช้ไลบรารี) */
export function InflowChart({ data }: { data: DashboardSummary['inflow'] }) {
  const W = 640, H = 190, L = 30, R = 10, T = 12, B = 26;
  const max = Math.max(1, ...data.map((x) => x.n));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (data.length <= 1 ? (W - L - R) / 2 : (i / (data.length - 1)) * (W - L - R));
  const y = (n: number) => T + (1 - n / top) * (H - T - B);
  const line = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - B} L${x(0).toFixed(1)},${H - B} Z`;
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round((top / 4) * k));
  const step = Math.max(1, Math.ceil(data.length / 6));
  const total = data.reduce((a, b) => a + b.n, 0);
  return (
    <figure className="chart" aria-label={`ผู้สมัครรายวัน รวม ${total} คน`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-hidden={false}>
        {ticks.map((t) => (<g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text></g>))}
        <path d={area} fill="var(--brand)" opacity=".08" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((p, i) => (
          <g key={p.d}>
            {(data.length <= 31 || p.n > 0) && <circle cx={x(i)} cy={y(p.n)} r={p.n > 0 ? 3.6 : 2} fill={p.n > 0 ? 'var(--brand)' : '#fff'} stroke="var(--brand)" strokeWidth="1.5"><title>{`${fmtDay(p.d)}: ${p.n} คน`}</title></circle>}
            {i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmtDay(p.d)}</text>}
          </g>
        ))}
      </svg>
      {total === 0 && <div className="chart-empty">ยังไม่มีผู้สมัครในช่วงเวลานี้</div>}
    </figure>
  );
}

/** กราฟแท่งแนวนอน ทักษะที่พบบ่อยที่สุด */
export function SkillsChart({ data, total, empty = 'ยังไม่มีข้อมูลทักษะในช่วงเวลานี้', unit = 'ผู้สมัคร' }: { data: DashboardSummary['skills']; total: number; empty?: string; unit?: string }) {
  if (data.length === 0) return <div className="chart-empty static">{empty}</div>;
  const max = Math.max(1, ...data.map((s) => s.n));
  return (
    <ol className="hbars">
      {data.map((s) => (
        <li key={s.name} title={`${s.name}: ${s.n} คน${total ? ` (${Math.round((s.n / total) * 100)}% ของ${unit})` : ''}`}>
          <span className="nm">{s.name}</span>
          <span className="track"><span style={{ width: `${(s.n / max) * 100}%` }} /></span>
          <span className="n">{s.n}</span>
        </li>
      ))}
    </ol>
  );
}

/** Funnel: สมัคร → สแกนแล้ว → ผ่านเกณฑ์ → สัมภาษณ์ → ข้อเสนอ → รับเข้าทำงาน พร้อมอัตราที่หายไปในแต่ละขั้น */
export function Funnel({ f }: { f: DashboardSummary['funnel'] }) {
  const stages: [string, number, string][] = [
    ['สมัครทั้งหมด', f.applied, 'var(--brand)'], ['สแกนเสร็จแล้ว', f.scanned, 'var(--brand)'],
    ['ผ่านเกณฑ์', f.passed, 'var(--accent)'], ['นัดสัมภาษณ์', f.interview, 'var(--accent)'],
    ['ยื่นข้อเสนอ', f.offer, 'var(--accent)'], ['รับเข้าทำงาน', f.hired, 'var(--accent)']
  ];
  const base = Math.max(1, f.applied);
  return (
    <div className="funnel">
      {stages.map(([label, n, color], i) => {
        const prev = i === 0 ? null : stages[i - 1][1];
        const drop = prev && prev > 0 ? Math.round(((prev - n) / prev) * 100) : null;
        return (
          <div className="fstage" key={label}>
            <div className="fbar" style={{ width: `${Math.max(n ? 6 : 0, (n / base) * 100)}%`, background: color, opacity: 1 - i * 0.1 }} />
            <div className="ftxt"><b>{n}</b> {label}{drop !== null && drop > 0 && <span className="fdrop">หายไป {drop}%</span>}</div>
          </div>
        );
      })}
      {f.rejected > 0 && <div className="fnote">ไม่รับ {f.rejected} คน (นับแยก)</div>}
    </div>
  );
}

/** การกระจายคะแนน 10 ช่วง แท่งสีตามระดับ: เขียว ≥ 80, เหลือง 60–79, เทา < 60 */
export function ScoreSpread({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  const sum = buckets.reduce((a, b) => a + b, 0);
  if (sum === 0) return <div className="chart-empty static">ยังไม่มีผลสแกนในช่วงเวลานี้</div>;
  return (
    <div>
      <div className="vbars" role="img" aria-label="การกระจายคะแนนจับคู่">
        {buckets.map((n, i) => (
          <div className="col" key={i} title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${n} คน`}>
            <span className="v">{n || ''}</span>
            <span className="b" style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%`, background: TONE_COLOR[scoreTone(i * 10 + 5)] }} />
            <span className="x">{i * 10}</span>
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: TONE_COLOR.high }} />สูง (80 ขึ้นไป)</span>
        <span><i style={{ background: TONE_COLOR.mid }} />ปานกลาง (60–79)</span>
        <span><i style={{ background: TONE_COLOR.low }} />ต่ำ (ต่ำกว่า 60)</span>
      </div>
    </div>
  );
}

/**
 * ผู้สมัครรายตำแหน่ง: แท่งซ้อนแนวนอน ยังไม่อ่าน (เขียวเข้ม) + อ่านแล้ว (เทา)
 * ความยาวรวมของแท่ง = จำนวนผู้สมัครของตำแหน่ง เทียบกับตำแหน่งที่มากที่สุด ตัวเลขทุกแถวแสดงเป็นคอลัมน์ข้างแท่ง (ไม่ใช้สีอย่างเดียว)
 * ตำแหน่งที่ยังไม่มีผู้สมัครซ่อนไว้ใต้ปุ่ม เพื่อไม่ให้รายการยาวเกินจำเป็น
 */
export function PositionReadChart({ rows }: { rows: PositionReadStat[] }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const withApps = rows.filter((r) => r.total > 0);
  const none = rows.filter((r) => r.total === 0);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const sum = rows.reduce((a, r) => ({ total: a.total + r.total, read: a.read + r.read, unread: a.unread + r.unread }), { total: 0, read: 0, unread: 0 });
  const shown = showEmpty ? [...withApps, ...none] : withApps;
  return (
    <div className="prchart">
      <div className="prsummary">
        <div className="legend">
          <span><i style={{ background: 'var(--brand)' }} />ยังไม่อ่าน</span>
          <span><i style={{ background: 'var(--read-gray)' }} />อ่านแล้ว</span>
        </div>
        <span className="muted">รวม <b>{sum.total}</b> คน · อ่านแล้ว <b>{sum.read}</b> · ยังไม่อ่าน <b style={{ color: 'var(--brand)' }}>{sum.unread}</b></span>
      </div>
      {withApps.length === 0 && <div className="chart-empty static">ยังไม่มีผู้สมัครในช่วงวันที่นี้</div>}
      {shown.length > 0 && (
        <>
          <div className="prrow prhead" aria-hidden="true"><span>ตำแหน่ง</span><span /><span className="n">รวม</span><span className="n">อ่านแล้ว</span><span className="n">ยังไม่อ่าน</span></div>
          <ol className="prrows" aria-label="ผู้สมัครรายตำแหน่ง แยกอ่านแล้วและยังไม่อ่าน">
            {shown.map((r) => (
              <li key={r.job_id}>
                <Link className="prrow" to={`/positions/${r.job_id}`} title={`${r.name}: รวม ${r.total} คน อ่านแล้ว ${r.read} ยังไม่อ่าน ${r.unread}`}>
                  <span className="nm">{r.name}{!r.is_active && <small className="muted"> (ปิดรับ)</small>}</span>
                  <span className="bar" aria-hidden="true">
                    {r.total > 0 && (
                      <span className="stack" style={{ width: `${(r.total / max) * 100}%` }}>
                        {r.unread > 0 && <span className="seg unread" style={{ flexGrow: r.unread }} />}
                        {r.read > 0 && <span className="seg read" style={{ flexGrow: r.read }} />}
                      </span>
                    )}
                  </span>
                  <span className="n tot">{r.total}</span>
                  <span className="n"><i className="lbl">อ่านแล้ว </i>{r.read}</span>
                  <span className={`n${r.unread > 0 ? ' hot' : ''}`}><i className="lbl">ยังไม่อ่าน </i>{r.unread}</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
      {none.length > 0 && (
        <button type="button" className="tab prmore" aria-expanded={showEmpty} onClick={() => setShowEmpty((v) => !v)}>
          {showEmpty ? 'ซ่อนตำแหน่งที่ยังไม่มีผู้สมัคร' : `แสดงอีก ${none.length} ตำแหน่งที่ยังไม่มีผู้สมัคร`}
        </button>
      )}
    </div>
  );
}
