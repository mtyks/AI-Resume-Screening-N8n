import { TONE_COLOR, scoreTone } from './lib';
import type { DashboardSummary } from './api';

const fmtDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

/** กราฟเส้นแนวโน้มผู้สมัครรายวัน (SVG ล้วน ไม่ต้องใช้ไลบรารี) */
export function InflowChart({ data }: { data: DashboardSummary['inflow'] }) {
  const W = 640, H = 190, L = 30, R = 10, T = 12, B = 26;
  const max = Math.max(1, ...data.map((x) => x.n));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - L - R));
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
export function SkillsChart({ data, total }: { data: DashboardSummary['skills']; total: number }) {
  if (data.length === 0) return <div className="chart-empty static">ยังไม่มีข้อมูลทักษะในช่วงเวลานี้</div>;
  const max = Math.max(1, ...data.map((s) => s.n));
  return (
    <ol className="hbars">
      {data.map((s) => (
        <li key={s.name} title={`${s.name}: ${s.n} คน${total ? ` (${Math.round((s.n / total) * 100)}% ของผู้สมัคร)` : ''}`}>
          <span className="nm">{s.name}</span>
          <span className="track"><span style={{ width: `${(s.n / max) * 100}%` }} /></span>
          <span className="n">{s.n}</span>
        </li>
      ))}
    </ol>
  );
}

/** Funnel: สมัคร → สแกนแล้ว → ผ่านเกณฑ์ → รับเข้าทำงาน พร้อมอัตราที่หายไปในแต่ละขั้น */
export function Funnel({ f }: { f: DashboardSummary['funnel'] }) {
  const stages: [string, number, string][] = [
    ['สมัครทั้งหมด', f.applied, 'var(--brand)'], ['สแกนเสร็จแล้ว', f.scanned, 'var(--brand)'],
    ['ผ่านเกณฑ์', f.passed, 'var(--accent)'], ['รับเข้าทำงาน', f.hired, 'var(--accent)']
  ];
  const base = Math.max(1, f.applied);
  return (
    <div className="funnel">
      {stages.map(([label, n, color], i) => {
        const prev = i === 0 ? null : stages[i - 1][1];
        const drop = prev && prev > 0 ? Math.round(((prev - n) / prev) * 100) : null;
        return (
          <div className="fstage" key={label}>
            <div className="fbar" style={{ width: `${Math.max(n ? 6 : 0, (n / base) * 100)}%`, background: color, opacity: 1 - i * 0.12 }} />
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
