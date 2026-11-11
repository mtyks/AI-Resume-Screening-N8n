import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { STATUS_LABEL, calibRates, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`);
const MIN_N = 20; // ต่ำกว่านี้ยังสรุปเปอร์เซ็นต์ไม่ได้

/** HR/Admin: เทียบ "ระบบแนะนำ" กับ "ผลตัดสินจริงของ HR" เพื่อใช้ปรับเกณฑ์ด้วยข้อมูลจริง */
export default function Calibration() {
  const [job, setJob] = useState('');
  const jobs = useAsync(() => api.listJobs(), []);
  const data = useAsync(() => api.calibrationSummary(job || null), [job]);
  const d = data.data;
  const r = d ? calibRates(d) : null;
  return (
    <main className="page">
      <PageHead title="ตรวจเทียบคะแนนกับผลตัดสิน" sub="ระบบแนะนำ = Gate ผ่านและคะแนนถึงเกณฑ์ · HR เห็นด้วย = สถานะ นัดสัมภาษณ์/ยื่นข้อเสนอ/รับเข้าทำงาน · นับเฉพาะคนที่ HR ตัดสินแล้ว (ไม่ใช่ “กำลังพิจารณา”)">
        <div className="field">
          <label htmlFor="cj" className="muted" style={{ fontSize: 13.5 }}>ตำแหน่ง</label>
          <select id="cj" className="select" style={{ height: 44 }} value={job} onChange={(e) => setJob(e.target.value)}>
            <option value="">ทุกตำแหน่ง</option>
            {(jobs.data ?? []).map((j) => <option key={j.job_id} value={j.job_id}>{j.position_name}</option>)}
          </select>
        </div>
      </PageHead>
      {data.error && <ErrorBox message={data.error} />}
      {data.loading && !d && <Loading />}
      {d && r && (
        <>
          <div className={`alert ${r.n < MIN_N ? 'warn' : 'ok'}`} role="status">
            มีผลประเมิน {d.scored} คน HR ตัดสินแล้ว {d.decided} คน{r.n < MIN_N ? ` ข้อมูลยังน้อยกว่า ${MIN_N} คน ตัวเลขร้อยละด้านล่างจึงยังใช้สรุปประสิทธิภาพไม่ได้ ใช้ดูแนวโน้มและรายการที่ไม่ตรงกันเท่านั้น` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div className="card" style={{ padding: '14px 18px', borderRadius: 12 }}><span className="muted" style={{ fontSize: 13.5 }}>ตรงกับ HR</span><div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 600 }}>{pct(r.agree)}</div></div>
            <div className="card" style={{ padding: '14px 18px', borderRadius: 12 }}><span className="muted" style={{ fontSize: 13.5 }}>ระบบแนะนำแล้ว HR เห็นด้วย</span><div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 600 }}>{pct(r.precision)}</div></div>
            <div className="card" style={{ padding: '14px 18px', borderRadius: 12 }}><span className="muted" style={{ fontSize: 13.5 }}>คนที่ HR เห็นด้วย ระบบแนะนำด้วย</span><div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 600 }}>{pct(r.recall)}</div></div>
          </div>
          <section className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="ตารางเทียบผล">
            <table style={{ borderCollapse: 'collapse', maxWidth: 520 }}>
              <thead><tr><th /><th style={{ padding: 8 }}>HR เห็นด้วย</th><th style={{ padding: 8 }}>HR ไม่เห็นด้วย</th></tr></thead>
              <tbody>
                <tr><th style={{ padding: 8, textAlign: 'left' }}>ระบบแนะนำ</th><td style={{ padding: 8, textAlign: 'center' }}>{d.tp}</td><td style={{ padding: 8, textAlign: 'center' }}>{d.fp}</td></tr>
                <tr><th style={{ padding: 8, textAlign: 'left' }}>ระบบไม่แนะนำ</th><td style={{ padding: 8, textAlign: 'center' }}>{d.fn}</td><td style={{ padding: 8, textAlign: 'center' }}>{d.tn}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>ช่อง “ระบบไม่แนะนำ แต่ HR เห็นด้วย” คือคนที่เกณฑ์อาจเข้มเกินไป ส่วน “ระบบแนะนำ แต่ HR ไม่เห็นด้วย” คือเกณฑ์อาจหลวมเกินไป ผล HR ขึ้นกับหลายปัจจัยนอกเหนือจาก Resume จึงไม่ถือเป็นเฉลยที่ถูกต้องเสมอไป</p>
          </section>
          {d.by_status.length > 0 && (
            <section className="card" style={{ padding: 20 }} aria-label="คะแนนตามสถานะ">
              <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>คะแนนตามสถานะการพิจารณา</h2>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr style={{ textAlign: 'left' }}><th style={{ padding: 6 }}>สถานะ</th><th>คน</th><th>เฉลี่ย</th><th>ต่ำสุด</th><th>สูงสุด</th></tr></thead>
                <tbody>{d.by_status.map((s) => <tr key={s.status}><td style={{ padding: 6 }}>{STATUS_LABEL[s.status] ?? s.status}</td><td>{s.n}</td><td>{s.avg ?? '-'}</td><td>{s.min ?? '-'}</td><td>{s.max ?? '-'}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          <section aria-label="รายการที่ไม่ตรงกัน">
            <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>รายการที่ระบบกับ HR ไม่ตรงกัน {d.disagree.length > 0 && <span className="muted" style={{ fontWeight: 400 }}>(สูงสุด 20 รายการ เรียงตามห่างจากเกณฑ์มาก)</span>}</h2>
            {d.disagree.length === 0 ? <div className="empty">ยังไม่มีรายการที่ไม่ตรงกัน</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.disagree.map((x) => (
                  <Link key={x.candidate_id} to={`/candidate/${x.candidate_id}`} className="card" style={{ padding: '10px 16px', borderRadius: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', justifyContent: 'space-between', textDecoration: 'none', color: 'inherit' }}>
                    <span><b>{x.full_name}</b> <span className="muted">· {x.applied_position}</span></span>
                    <span className="muted" style={{ fontSize: 14 }}>คะแนน {x.score} (เกณฑ์ {x.thr}{x.gate !== 'Pass' ? ' · Gate ไม่ผ่าน' : ''}) · HR: {STATUS_LABEL[x.status] ?? x.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
