import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Candidate, CriterionEval } from '../api';
import { SCORE_NOTE, STATUS_LABEL, KIND_LABEL, expFlag, fmtShort, fmtStamp, rowKind, useAsync } from '../lib';
import { useStats } from '../stats';
import { ErrorBox, Loading } from '../ui';

// ต้องตรงกับ check constraint ของคอลัมน์ application_status ในฐานข้อมูล
const STATUSES = ['In Review', 'Hired', 'Rejected'];
const EXP = ['ไม่มีประสบการณ์ (นักศึกษาจบใหม่)', '1-3 ปี', '3-5 ปี', 'มากกว่า 5 ปี'];

function Criteria({ title, items }: { title: string; items: CriterionEval[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="muted" style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, margin: '18px 0 6px' }}>{title}</div>
      {items.map((c) => {
        const found = c.confidence >= 50;
        const strong = c.confidence >= 80;
        const bar = strong ? 'var(--accent)' : found ? 'var(--warn-bar)' : 'var(--danger-bar)';
        const pill = strong ? ['var(--accent-soft)', 'var(--accent-ink)', 'พบ'] : found ? ['var(--warn-bg)', 'var(--warn-ink)', 'พบบางส่วน'] : ['var(--danger-bg)', 'var(--danger-ink)', 'ไม่พบ'];
        return (
          <div key={c.criterion} style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 16px' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{c.criterion}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="meter" style={{ width: 120, margin: 0 }}><span style={{ width: `${c.confidence}%`, background: bar }} /><i style={{ left: '50%' }} /></span>
                <span className="mono" style={{ fontSize: 15, minWidth: 34, textAlign: 'right' }}>{c.confidence}</span>
                <span className="pill" style={{ background: pill[0], color: pill[1], fontSize: 12.5, padding: '3px 10px' }}>{pill[2]}</span>
              </span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--neutral-ink)', background: '#f8f8f5', borderRadius: 8, padding: '10px 12px' }}>{c.evidence}</div>
          </div>
        );
      })}
    </div>
  );
}

function EditCandidate({ c, onSaved }: { c: Candidate; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: c.full_name, phone_number: c.phone_number, email: c.email, exp: c.self_reported_experience_range ?? '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const valid = f.full_name.trim() && /^[0-9+\-\s()]{8,20}$/.test(f.phone_number.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && EXP.includes(f.exp);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateCandidate(c.candidate_id, { full_name: f.full_name.trim(), phone_number: f.phone_number.trim(), email: f.email.trim().toLowerCase(), self_reported_experience_range: f.exp });
      setMsg({ ok: true, text: 'บันทึกข้อมูลผู้สมัครแล้ว' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ (อีเมลนี้อาจสมัครตำแหน่งนี้ไว้แล้ว)' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700 }}>แก้ไขข้อมูลผู้สมัคร <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>(Admin)</span></h2>
        <button type="button" className="btn small" onClick={() => setOpen((o) => !o)}>{open ? 'ปิด' : 'แก้ไข'}</button>
      </div>
      {open && (
        <>
          <div className="field"><label htmlFor="ec_name">ชื่อ-นามสกุล</label><input id="ec_name" className="input" value={f.full_name} onChange={set('full_name')} /></div>
          <div className="field"><label htmlFor="ec_phone">เบอร์โทร</label><input id="ec_phone" className="input" value={f.phone_number} onChange={set('phone_number')} /></div>
          <div className="field"><label htmlFor="ec_email">อีเมล</label><input id="ec_email" className="input" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label htmlFor="ec_exp">ช่วงประสบการณ์</label><select id="ec_exp" className="select" value={f.exp} onChange={set('exp')}><option value="">เลือก</option>{EXP.map((x) => <option key={x}>{x}</option>)}</select></div>
          <span className="muted" style={{ fontSize: 12.5 }}>การแก้ไขนี้ไม่ทำให้ระบบประเมินคะแนนใหม่ ตำแหน่งที่สมัครและไฟล์ Resume แก้ไม่ได้</span>
          {msg && <div role="status" className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <button type="button" className="btn primary" disabled={!valid || busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </>
      )}
    </section>
  );
}

/** โน้ตของ HR ต่อผู้สมัคร (ข้อความเดียว แก้ไขทับได้) */
function NoteCard({ c, onSaved }: { c: Candidate; onSaved: () => void }) {
  const [text, setText] = useState(c.hr_note ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = text.trim() !== (c.hr_note ?? '');
  async function save() {
    setBusy(true);
    setMsg(null);
    try { await api.saveNote(c.candidate_id, text); setMsg({ ok: true, text: 'บันทึกโน้ตแล้ว' }); onSaved(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกโน้ตไม่สำเร็จ' }); }
    finally { setBusy(false); }
  }
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700 }}>โน้ตของ HR</h2>
      <textarea className="input" rows={4} maxLength={2000} style={{ height: 'auto', padding: '12px 14px', resize: 'vertical' }} placeholder="เช่น นัดสัมภาษณ์วันพฤหัส, ติดต่อกลับแล้ว, เงินเดือนที่คาดหวัง…" value={text} onChange={(e) => setText(e.target.value)} aria-label="โน้ตของ HR" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary small" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกโน้ต'}</button>
        {c.hr_note_at && <span className="muted" style={{ fontSize: 12.5 }}>แก้ล่าสุด {fmtShort(c.hr_note_at)}{c.hr_note_by ? ` โดย ${c.hr_note_by}` : ''}</span>}
      </div>
      {msg && <div role="status" className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <span className="muted" style={{ fontSize: 12.5 }}>โน้ตนี้เห็นได้เฉพาะ HR/Admin ผู้สมัครไม่เห็น</span>
    </section>
  );
}

export default function CandidateDetail() {
  const { id = '' } = useParams();
  const data = useAsync(() => api.getCandidate(id), [id]);
  const [saved, setSaved] = useState(false);
  const [opening, setOpening] = useState(false);
  const [resumeErr, setResumeErr] = useState<string | null>(null);
  const { session } = useAuth();
  const { reload: reloadStats } = useStats();
  const nav = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();

  // เปิดดูผู้สมัครคนไหน = ทำเครื่องหมาย "อ่านแล้ว" ให้อัตโนมัติ (ยอดยังไม่อ่านที่เมนูและการแจ้งเตือนลดลงตามไป)
  const loadedId = data.data?.candidate.candidate_id;
  const wasRead = data.data?.candidate.is_read;
  useEffect(() => {
    if (!loadedId || wasRead) return;
    api.setRead([loadedId], true).then(reloadStats).catch(() => { /* ไม่ทำให้หน้าเสียถ้าบันทึกไม่สำเร็จ */ });
     
  }, [loadedId]);

  if (data.loading && !data.data) return <main className="page"><Loading /></main>;
  if (data.error) return <main className="page"><ErrorBox message={data.error} /></main>;
  if (!data.data) return <main className="page"><div className="empty">ไม่พบผู้สมัครรหัส {id}</div><Link to="/positions">← กลับไปเลือกตำแหน่ง</Link></main>;

  const { candidate: c, match: m, job, logs } = data.data;
  // กลับไปรายชื่อเดิม (คงตัวกรองและหน้าที่เปิดอยู่) ถ้าเข้ามาจากหน้ารายชื่อ ไม่เช่นนั้นไปหน้าของตำแหน่งนี้
  const backTo = `/positions/${sp.get('job') ?? job?.job_id ?? ''}`;
  const goBack = () => (location.key !== 'default' ? nav(-1) : nav(backTo));

  async function openResume() {
    setOpening(true);
    setResumeErr(null);
    const win = window.open('', '_blank'); // เปิดแท็บก่อน กันถูกเบราว์เซอร์บล็อก popup หลัง await
    try {
      const url = await api.getResumeUrl(c);
      if (!url) throw new Error('ไม่พบไฟล์ Resume');
      if (win) win.location.href = url; else window.location.href = url;
    } catch (e) {
      win?.close();
      setResumeErr(e instanceof Error ? e.message : 'เปิดไฟล์ไม่สำเร็จ');
    } finally {
      setOpening(false);
    }
  }
  const row = { candidate: c, match: m };
  const kind = job ? rowKind(row, job) : 'pending';
  const d = m?.evaluation_detail;
  const avg = (xs: CriterionEval[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b.confidence, 0) / xs.length) : 0);
  const wsum = job ? job.weight_musthave + job.weight_preferred + job.weight_tool || 1 : 1;
  const parts = job && d ? [
    { name: 'ทักษะที่ต้องมี', w: job.weight_musthave / wsum, a: avg(d.must_have_evaluation) },
    { name: 'ทักษะที่ควรมี', w: job.weight_preferred / wsum, a: avg(d.preferred_evaluation) },
    { name: 'เครื่องมือที่ต้องใช้', w: job.weight_tool / wsum, a: avg(d.tool_evaluation) }
  ] : [];

  return (
    <main className="page">
      <a href={`#${backTo}`} onClick={(e) => { e.preventDefault(); goBack(); }} style={{ fontSize: 14.5, fontWeight: 600, textDecoration: 'none' }}>← กลับไปรายชื่อผู้สมัคร</a>

      <section className="card" style={{ padding: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px 36px' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>{c.full_name}</h1>
            <span className={`pill ${kind}`}>{KIND_LABEL[kind]}</span>
            <button type="button" className="starbtn" style={{ width: 40, height: 40 }} aria-pressed={c.starred} title={c.starred ? 'เอาออกจาก Shortlist' : 'ติดดาว (Shortlist)'}
              onClick={async () => { await api.setStarred(c.candidate_id, !c.starred); data.reload(); reloadStats(); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill={c.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z" /></svg>
              <span className="sr-only">{c.starred ? 'ติดดาวอยู่' : 'ยังไม่ติดดาว'}</span>
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 14.5, display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
            <span className="mono">{c.candidate_id}</span><span>สมัครตำแหน่ง {c.applied_position}</span><span>ส่งเมื่อ {fmtShort(c.received_at)}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 14.5, display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}><span>{c.email}</span><span>{c.phone_number}</span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          {m && (
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: 13.5 }}>คะแนนจับคู่{job ? ` (เกณฑ์ผ่าน ${job.match_threshold})` : ''}</div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 56, lineHeight: 1.1, color: kind === 'pass' ? 'var(--accent)' : kind === 'below' ? 'var(--warn-bar)' : 'var(--danger-bar)' }}>{m.match_score.toFixed(1)}</div>
            </div>
          )}
          <div className="field" style={{ minWidth: 190 }}>
            <label htmlFor="st" className="muted" style={{ fontSize: 13.5 }}>สถานะการพิจารณา</label>
            <select id="st" className="select" style={{ height: 44 }} value={c.application_status}
              onChange={async (e) => { await api.setApplicationStatus(c.candidate_id, e.target.value); setSaved(true); data.reload(); }}>
              {[...new Set([c.application_status, ...STATUSES])].map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
            </select>
            {saved && <span className="hint" role="status">บันทึกสถานะแล้ว</span>}
          </div>
        </div>
      </section>

      {c.processing_status !== 'processed' && (
        <div className={`alert ${c.processing_status === 'failed' ? 'err' : 'warn'}`} role="status">
          {c.processing_status === 'failed' ? `ประมวลผลไม่สำเร็จ: ${c.processing_error ?? ''}` : 'ใบสมัครนี้อยู่ในคิว ยังไม่มีผลการประเมิน'}
          <div style={{ marginTop: 8 }}><button className="btn small" onClick={async () => { try { await api.retryCandidate(c.candidate_id); } catch (e) { window.alert(e instanceof Error ? e.message : 'สั่งสแกนซ้ำไม่สำเร็จ'); } data.reload(); }}>สแกนซ้ำ</button></div>
        </div>
      )}

      <div className="split">
        <div style={{ flex: '2 1 620px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {m && d && job && (
            <>
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 4px' }}>ภาพรวมแยกตามหมวด</h2>
                  <p className="muted" style={{ margin: 0, fontSize: 14 }}>ค่าเฉลี่ยความมั่นใจของ AI ในแต่ละหมวด เทียบกับน้ำหนักที่ตั้งไว้ในตำแหน่ง (ไม่ใช่คะแนนที่ถูกคูณน้ำหนักแล้ว)</p>
                </div>
                {parts.map((p) => (
                  <div key={p.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,2fr) 64px', gap: '8px 20px', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div><div className="muted" style={{ fontSize: 13 }}>น้ำหนัก {Math.round(p.w * 100)}%</div></div>
                    <div className="meter" style={{ height: 10, margin: 0 }}><span style={{ height: 10, width: `${p.a}%`, background: 'var(--accent)' }} /></div>
                    <div className="mono" style={{ textAlign: 'right', fontSize: 15 }}>{p.a}</div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontSize: 14.5 }}>
                  <span><span className="muted">วิธีคิดคะแนน: </span>{SCORE_NOTE}</span>
                  <span style={{ fontWeight: 600 }}>Gate: {m.gate_status === 'Pass' ? 'ผ่าน' : m.gate_status.replace('Failed: ', 'ไม่ผ่าน — ')}</span>
                </div>
              </section>

              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2 style={{ fontSize: 19, fontWeight: 700 }}>ผลประเมินรายเกณฑ์พร้อมหลักฐาน</h2>
                <p className="muted" style={{ margin: '0 0 6px', fontSize: 14 }}>ความมั่นใจของ AI 0–100 · ตั้งแต่ 50 ถือว่าพบ · ทักษะที่ต้องมีหากต่ำกว่า 50 จะไม่ผ่าน Gate</p>
                <Criteria title="ทักษะที่ต้องมี (Must-have)" items={d.must_have_evaluation} />
                <Criteria title="ทักษะที่ควรมี (Preferred)" items={d.preferred_evaluation} />
                <Criteria title="เครื่องมือ (Required tools)" items={d.tool_evaluation} />
              </section>
            </>
          )}
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700 }}>Resume</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8f8f5', borderRadius: 10, padding: '12px 14px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
              <span style={{ fontSize: 14.5, overflowWrap: 'anywhere' }}>Resume ของ {c.full_name}.pdf</span>
            </div>
            {c.resume_file_url === '#'
              ? <span className="btn" aria-disabled="true">ไฟล์ตัวอย่าง (โหมดทดลอง)</span>
              : <button type="button" className="btn primary" disabled={opening} onClick={() => void openResume()}>{opening ? 'กำลังเตรียมไฟล์…' : 'เปิดไฟล์ Resume ↗'}</button>}
            {resumeErr && <span className="err" role="alert">{resumeErr}</span>}
            <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>ไฟล์เก็บแบบส่วนตัว ลิงก์ที่เปิดจะหมดอายุใน 10 นาที</span>
          </section>

          <NoteCard key={c.candidate_id} c={c} onSaved={() => data.reload()} />

          {session?.role === 'Admin' && <EditCandidate key={c.candidate_id + c.email + c.full_name} c={c} onSaved={() => data.reload()} />}

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700 }}>ข้อมูลที่ระบบอ่านได้</h2>
            <div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>ทักษะที่พบ (ความมั่นใจ ≥ 50)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {c.skills.length ? c.skills.map((s) => <span key={s} className="pill pass" style={{ fontWeight: 500 }}>{s}</span>) : <span className="muted" style={{ fontSize: 14 }}>—</span>}
              </div>
            </div>
            <div className="grid2" style={{ gap: 12 }}>
              <div><div className="muted" style={{ fontSize: 13 }}>ประสบการณ์ที่ผู้สมัครเลือกในฟอร์ม</div><div style={{ fontSize: 16, fontWeight: 600 }}>{c.self_reported_experience_range ?? '—'}</div></div>
            </div>
            {job && (() => { const f = expFlag(c, job); return f.level === 'na' ? null : <div className={`alert ${f.level === 'ok' ? 'ok' : f.level === 'low' ? 'warn' : ''}`} style={{ fontSize: 14 }}>{f.label} <span className="muted">· ไม่มีผลต่อคะแนน HR พิจารณาเอง</span></div>; })()}
          </section>

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700 }}>ประวัติการประมวลผล</h2>
            {logs.length === 0 && <span className="muted" style={{ fontSize: 14 }}>ยังไม่มี log</span>}
            {logs.map((l) => (
              <div key={l.log_id} style={{ display: 'flex', gap: 14 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 6, flex: '0 0 12px', background: l.status === 'Success' ? 'var(--accent)' : 'var(--danger-bar)' }} />
                <div><div style={{ fontSize: 14.5, fontWeight: 600 }}>{l.message}</div><div className="muted mono" style={{ fontSize: 12.5 }}>{fmtStamp(l.timestamp)} · {l.status}</div></div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
