import type { EvaluationDetail, Job, MatchResult } from '../api';
import { FOUND_MIN, RUBRIC, SCORE_REFS, scoreBreakdown } from '../lib';

/** อธิบายว่าผู้สมัครได้คะแนนนี้เพราะอะไร: ที่มาของคะแนน ผลของแต่ละหมวด Gate และเกณฑ์ผ่าน */
export function ScoreWhy({ job, m, d }: { job: Job; m: MatchResult; d: EvaluationDetail }) {
  const { parts, total } = scoreBreakdown(job, d);
  const gateOk = m.gate_status === 'Pass';
  const stored = m.match_score;
  const differs = Math.abs(total - stored) > 1;
  const pass = gateOk && stored >= job.match_threshold;
  const mustLow = d.must_have_evaluation.filter((x) => x.confidence < FOUND_MIN);

  let verdict: string;
  if (!gateOk) verdict = `ไม่ผ่าน Gate เพราะทักษะที่ต้องมีต่ำกว่า ${FOUND_MIN}: ${mustLow.map((x) => `${x.criterion} (${x.confidence})`).join(', ') || m.gate_status.replace('Failed: ', '')} — ทักษะที่ต้องมีขาดข้อใดข้อหนึ่งจึงไม่ผ่าน แม้คะแนนหมวดอื่นสูง`;
  else if (pass) verdict = `ผ่านเกณฑ์: ผ่าน Gate และคะแนน ${stored.toFixed(1)} ถึงเกณฑ์ ${job.match_threshold}`;
  else verdict = `ยังไม่ถึงเกณฑ์: ผ่าน Gate แต่คะแนน ${stored.toFixed(1)} ต่ำกว่าเกณฑ์ ${job.match_threshold} อยู่ ${(job.match_threshold - stored).toFixed(1)} คะแนน`;

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 4px' }}>ทำไมจึงได้ {stored.toFixed(1)} คะแนน</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          ที่มาของคะแนน: AI (Gemini) อ่านข้อความใน Resume ของผู้สมัครเท่านั้น แล้วให้ระดับความมั่นใจ 0–100 ทีละทักษะ พร้อมยกหลักฐานจาก Resume (ดูด้านล่าง) ระบบนำระดับเหล่านั้นมาคิดตามน้ำหนักที่ HR ตั้งไว้ในตำแหน่งนี้ ผลนี้เป็นข้อมูลประกอบ ผู้ตัดสินคือ HR
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5 }}>
          <thead>
            <tr className="muted" style={{ textAlign: 'left', fontSize: 13 }}>
              <th style={{ padding: '6px 8px 6px 0' }}>หมวด</th><th style={{ padding: 6 }}>พบ / ทั้งหมด</th><th style={{ padding: 6, textAlign: 'right' }}>เฉลี่ย</th>
              <th style={{ padding: 6, textAlign: 'right' }}>น้ำหนัก</th><th style={{ padding: '6px 0 6px 6px', textAlign: 'right' }}>ส่วนที่ได้</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.key} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 8px 10px 0', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: 10 }}>{p.found} / {p.n}</td>
                <td className="mono" style={{ padding: 10, textAlign: 'right' }}>{p.avg.toFixed(1)}</td>
                <td className="mono" style={{ padding: 10, textAlign: 'right' }}>{Math.round(p.weight * 100)}%</td>
                <td className="mono" style={{ padding: '10px 0 10px 10px', textAlign: 'right' }}>{p.part.toFixed(1)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--line-strong)', fontWeight: 700 }}>
              <td colSpan={4} style={{ padding: '10px 8px 4px 0' }}>รวมตามสูตร</td>
              <td className="mono" style={{ padding: '10px 0 4px 10px', textAlign: 'right' }}>{total.toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
        “เฉลี่ย” ของหมวดทักษะที่ต้องมี นับข้อที่พบ (ตั้งแต่ {FOUND_MIN}) เป็น 100 ข้อที่ไม่ถึง {FOUND_MIN} นับตามจริง ส่วนอีกสองหมวดเฉลี่ยตามค่าจริง หมวดที่ตำแหน่งไม่มีเกณฑ์จะไม่นำมาคิดน้ำหนัก ประสบการณ์ไม่นำมาคิดคะแนน
      </p>
      {differs && (
        <div className="alert warn" style={{ fontSize: 14 }}>
          คะแนนที่บันทึก ({stored.toFixed(1)}) ต่างจากผลคำนวณตามสูตรข้างต้น ({total.toFixed(1)}) อาจเป็นเพราะผู้สมัครไม่ผ่าน Gate หรือคะแนนนี้คิดด้วยสูตรเวอร์ชันก่อนหน้า ให้ถือคะแนนที่บันทึกเป็นหลัก
        </div>
      )}

      <div className={`alert ${pass ? 'ok' : gateOk ? 'warn' : 'err'}`} style={{ fontSize: 14.5, fontWeight: 600 }} role="status">{verdict}</div>
      {gateOk && parts.some((p) => p.lowest.length > 0) && (
        <div style={{ fontSize: 14 }}>
          <span className="muted">ข้อที่ดึงคะแนนลง (ต่ำกว่า {FOUND_MIN}): </span>
          {parts.flatMap((p) => p.lowest.map((x) => `${x.criterion} (${x.confidence})`)).join(', ')}
        </div>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14.5 }}>ความหมายของระดับ 0–100</summary>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
          {RUBRIC.map((r) => <li key={r.v}><b className="mono">{r.v}</b> {r.label} — {r.desc}</li>)}
        </ul>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>AI เลือกได้เฉพาะ 5 ระดับนี้ เพื่อให้คะแนนนิ่งและอธิบายได้ ทุกข้อต้องมีหลักฐานจาก Resume ถ้าไม่พบให้ตอบ 0</p>
      </details>

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14.5 }}>หลักการและแหล่งอ้างอิงของเกณฑ์</summary>
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
          {SCORE_REFS.map((r) => <li key={r.ref} style={{ marginBottom: 8 }}>{r.principle}<br /><span className="muted" style={{ fontSize: 13 }}>{r.ref}</span></li>)}
        </ul>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.6 }}>
          แหล่งอ้างอิงรองรับ “หลักการ” เท่านั้น ส่วนน้ำหนักของหมวด เกณฑ์ผ่านและค่า Gate เป็นค่าที่ HR ตั้งตามตำแหน่ง ยังไม่ได้ตรวจสอบกับผลการจ้างงานจริง จึงไม่ควรตีความคะแนนเป็นความแม่นยำที่รับรองแล้ว ดูความตรงกับการตัดสินของ HR ได้ที่หน้า “ตรวจเทียบคะแนน”
        </p>
      </details>
    </section>
  );
}
