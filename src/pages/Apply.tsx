import { useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { SubmitResult } from '../api';
import { useAsync } from '../lib';
import { Mark, ResumeArt } from '../ui';

const EXP = ['ไม่มีประสบการณ์ (นักศึกษาจบใหม่)', '1-3 ปี', '3-5 ปี', 'มากกว่า 5 ปี'];

type Errors = Partial<Record<'full_name' | 'phone_number' | 'email' | 'applied_position' | 'exp' | 'resume' | 'consent', string>>;

const STEPS = ['เลือกตำแหน่งและกรอกข้อมูล แนบ Resume เป็นไฟล์ PDF', 'ระบบอ่าน Resume แล้วเทียบกับทักษะที่ตำแหน่งต้องการ', 'ฝ่ายบุคคลดูผลและติดต่อกลับทางอีเมลหรือเบอร์โทร'];

export default function Apply() {
  const jobs = useAsync(() => api.listOpenPositions(), []);
  const [form, setForm] = useState({ full_name: '', phone_number: '', email: '', applied_position: '' });
  const [exp, setExp] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(): Errors {
    const e: Errors = {};
    if (!form.full_name.trim()) e.full_name = 'กรอกชื่อ-นามสกุล';
    if (form.phone_number.replace(/\D/g, '').length < 9) e.phone_number = 'กรอกเบอร์โทรให้ครบ อย่างน้อย 9 หลัก';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com';
    if (!form.applied_position) e.applied_position = 'เลือกตำแหน่งที่ต้องการสมัคร';
    if (!exp) e.exp = 'เลือกช่วงประสบการณ์ทำงานของคุณ';
    if (!file) e.resume = 'แนบไฟล์ Resume (PDF)';
    else if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) e.resume = 'ไฟล์ต้องเป็น PDF เท่านั้น';
    else if (file.size > 5 * 1024 * 1024) e.resume = 'ไฟล์ใหญ่เกิน 5 MB ลองบีบอัดไฟล์แล้วแนบใหม่';
    if (!consent) e.consent = 'ติ๊กยินยอมก่อนส่งใบสมัคร';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !file) {
      // พาไปยังช่องแรกที่ผิด
      const first = document.querySelector('[aria-invalid="true"], .err');
      first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setBusy(true);
    try {
      setResult(await api.submitApplication({ ...form, self_reported_experience_range: exp, resume: file }));
    } catch {
      setResult({ status: 'error', message: 'ระบบขัดข้องชั่วคราว' });
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  const bad = (k: keyof Errors) => (errors[k] ? 'true' : undefined);
  const positions = jobs.data ?? [];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: '100vh' }}>
      <aside className="hero" style={{ flex: '1 1 440px', padding: 'clamp(28px, 5vw, 56px)', display: 'flex', flexDirection: 'column', gap: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--display)', fontSize: 18, fontWeight: 600 }}><Mark size={38} /> Resume Screening</div>
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ margin: '0 0 16px' }}>ส่ง Resume ของคุณให้เรา แล้วรอฟังผลได้เลย</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.75, color: 'var(--nav-muted)' }}>เลือกตำแหน่งที่สนใจ แนบไฟล์ PDF ระบบจะช่วยเทียบทักษะของคุณกับตำแหน่ง ก่อนส่งต่อให้ฝ่ายบุคคลพิจารณา</p>
        </div>
        <div style={{ margin: '8px 0 20px' }}><ResumeArt /></div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 460 }}>
          {STEPS.map((t, i) => (
            <li key={t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ flex: '0 0 30px', height: 30, borderRadius: '50%', background: 'var(--nav-2)', color: 'var(--hilite)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, fontFamily: 'var(--display)' }}>{i + 1}</span>
              <span style={{ fontSize: 15.5, lineHeight: 1.6, paddingTop: 2, color: '#e3e7ff' }}>{t}</span>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 'auto', fontSize: 14, color: 'var(--nav-muted)', lineHeight: 1.7 }}>
          ข้อมูลของคุณใช้เพื่อการพิจารณาสมัครงานเท่านั้น
          <div style={{ marginTop: 8 }}><Link to="/login" style={{ color: 'var(--hilite)' }}>สำหรับเจ้าหน้าที่ HR: เข้าสู่ระบบ</Link></div>
        </div>
      </aside>

      <main style={{ flex: '1.2 1 560px', minWidth: 0, padding: 'clamp(20px, 4vw, 56px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div className="formcard">
          {!result && (
            <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 700 }}>ใบสมัครงาน</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>ทุกช่องต้องกรอก</p>
              </div>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }} aria-labelledby="s1">
                <h3 id="s1" className="section-h"><span className="n">1</span> ตำแหน่งที่สมัคร</h3>
                {jobs.loading && <div className="muted">กำลังโหลดตำแหน่งที่เปิดรับ…</div>}
                {jobs.error && <div className="alert err" role="alert">โหลดรายการตำแหน่งไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้ง</div>}
                {!jobs.loading && !jobs.error && positions.length === 0 && (
                  <div className="empty">ตอนนี้ยังไม่มีตำแหน่งที่เปิดรับสมัคร ลองกลับมาดูใหม่ภายหลัง</div>
                )}
                <div className="pos-grid" role="radiogroup" aria-labelledby="s1">
                  {positions.map((p) => (
                    <label key={p.job_id} className="pos">
                      <input type="radio" name="position" value={p.position_name} checked={form.applied_position === p.position_name} onChange={set('applied_position')} />
                      <span className="dot" />
                      <span style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 17, fontWeight: 600 }}>{p.position_name}</span>
                      {p.description && <span className="muted" style={{ display: 'block', fontSize: 14.5, marginTop: 2 }}>{p.description}</span>}
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        <span className="chip" style={{ background: 'var(--hilite-soft)', color: '#6b4e00' }}>{p.min_experience_years > 0 ? `ประสบการณ์ ${p.min_experience_years} ปีขึ้นไป` : 'รับนักศึกษาจบใหม่'}</span>
                        {p.must_have_skills.map((s) => <span className="chip" key={s}>{s}</span>)}
                        {p.required_tools.map((s) => <span className="chip" key={s} style={{ background: 'var(--brand-soft)', color: 'var(--brand-dark)' }}>{s}</span>)}
                      </span>
                      {form.applied_position === p.position_name && (p.preferred_skills.length > 0 || p.close_at) && (
                        <span className="muted" style={{ display: 'block', fontSize: 13.5, marginTop: 10, lineHeight: 1.6 }}>
                          {p.preferred_skills.length > 0 && <>ถ้ามีจะยิ่งดี: {p.preferred_skills.join(', ')}. </>}
                          {p.close_at && <>ปิดรับสมัคร {new Date(p.close_at).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })}</>}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                {errors.applied_position && <span className="err field" role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13.5, fontWeight: 500 }}>{errors.applied_position}</span>}

                <div role="group" aria-labelledby="exp_label" className="field">
                  <span id="exp_label" className="label">ประสบการณ์ทำงานของคุณ</span>
                  <div className="seg">
                    {EXP.map((x) => (
                      <label key={x}>
                        <input type="radio" name="exp" value={x} checked={exp === x} onChange={() => setExp(x)} />
                        {x}
                      </label>
                    ))}
                  </div>
                  {errors.exp && <span className="err" role="alert">{errors.exp}</span>}
                </div>
              </section>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 20 }} aria-labelledby="s2">
                <h3 id="s2" className="section-h"><span className="n">2</span> ข้อมูลติดต่อ</h3>
                <div className="field">
                  <label htmlFor="full_name">ชื่อ-นามสกุล</label>
                  <input id="full_name" className="input" autoComplete="name" value={form.full_name} onChange={set('full_name')} aria-invalid={bad('full_name')} placeholder="เช่น สมหญิง ใจดี" />
                  {errors.full_name && <span className="err" role="alert">{errors.full_name}</span>}
                </div>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor="phone">เบอร์โทรศัพท์</label>
                    <input id="phone" className="input" type="tel" autoComplete="tel" inputMode="tel" value={form.phone_number} onChange={set('phone_number')} aria-invalid={bad('phone_number')} placeholder="08x-xxx-xxxx" />
                    {errors.phone_number && <span className="err" role="alert">{errors.phone_number}</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="email">อีเมล</label>
                    <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={bad('email')} placeholder="name@example.com" />
                    {errors.email && <span className="err" role="alert">{errors.email}</span>}
                  </div>
                </div>
              </section>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-labelledby="s3">
                <h3 id="s3" className="section-h"><span className="n">3</span> Resume</h3>
                <label className={`drop${over ? ' over' : ''}${file ? ' has' : ''}`} htmlFor="resume" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop} style={{ position: 'relative' }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={file ? 'var(--accent)' : 'var(--brand)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {file ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" /></>}
                  </svg>
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 16, overflowWrap: 'anywhere' }}>{file ? file.name : 'ลากไฟล์ PDF มาวางที่นี่ หรือกดเพื่อเลือกไฟล์'}</span>
                  <span className="muted" style={{ fontSize: 13.5 }}>{file ? `${(file.size / 1024).toFixed(0)} KB · กดเพื่อเปลี่ยนไฟล์` : 'ไฟล์ PDF ขนาดไม่เกิน 5 MB รองรับทั้ง PDF ตัวอักษรและ PDF สแกน'}</span>
                  <input id="resume" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-invalid={bad('resume')} />
                </label>
                {errors.resume && <span className="err" role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13.5, fontWeight: 500 }}>{errors.resume}</span>}

                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={bad('consent')} style={{ width: 22, height: 22, margin: '2px 0 0', accentColor: 'var(--brand)', flex: '0 0 22px' }} />
                  <span>ฉันยินยอมให้เก็บและใช้ข้อมูลในใบสมัครเพื่อการพิจารณาสมัครงาน</span>
                </label>
                {errors.consent && <span className="err" role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13.5, fontWeight: 500 }}>{errors.consent}</span>}
              </section>

              <button className="btn primary" type="submit" disabled={busy} style={{ height: 54, fontSize: 17, borderRadius: 14, fontFamily: 'var(--display)' }}>
                {busy ? 'กำลังส่งใบสมัคร…' : 'ส่งใบสมัคร'}
              </button>
            </form>
          )}

          {result?.status === 'received' && (
            <Outcome tone="ok" title="ส่งใบสมัครเรียบร้อยแล้ว"
              body="ระบบกำลังอ่าน Resume ของคุณ ฝ่ายบุคคลจะตรวจสอบและติดต่อกลับทางอีเมลหรือเบอร์โทรที่ให้ไว้ เก็บรหัสใบสมัครไว้เผื่อสอบถาม"
              refId={result.candidate_id}
              action={<button className="btn" onClick={() => { setResult(null); setForm({ full_name: '', phone_number: '', email: '', applied_position: '' }); setExp(null); setFile(null); setConsent(false); }}>สมัครตำแหน่งอื่น</button>} />
          )}
          {result?.status === 'duplicate' && (
            <Outcome tone="info" title="คุณสมัครตำแหน่งนี้ไว้แล้ว"
              body={`อีเมลนี้มีใบสมัครตำแหน่ง ${form.applied_position} อยู่ในระบบแล้ว ไม่ต้องส่งซ้ำ ฝ่ายบุคคลจะติดต่อกลับตามขั้นตอนปกติ ถ้าต้องการสมัครตำแหน่งอื่น กลับไปแก้ฟอร์มได้เลย`}
              refId={result.candidate_id}
              action={<button className="btn primary" onClick={() => setResult(null)}>กลับไปแก้ฟอร์ม</button>} />
          )}
          {result?.status === 'error' && (
            <Outcome tone="err" title="ส่งใบสมัครไม่สำเร็จ"
              body={`${result.message} ข้อมูลที่คุณกรอกยังอยู่ครบ ลองส่งอีกครั้งได้เลย`}
              action={<button className="btn primary" onClick={() => setResult(null)}>กลับไปส่งอีกครั้ง</button>} />
          )}
        </div>
      </main>
    </div>
  );
}

function Outcome({ tone, title, body, refId, action }: { tone: 'ok' | 'info' | 'err'; title: string; body: string; refId?: string; action: React.ReactNode }) {
  const color = tone === 'ok' ? ['var(--accent-soft)', 'var(--accent)'] : tone === 'info' ? ['var(--info-bg)', 'var(--info-ink)'] : ['var(--danger-bg)', 'var(--danger-ink)'];
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: color[0], display: 'flex', alignItems: 'center', justifyContent: 'center', color: color[1], fontSize: 28, fontWeight: 700 }} aria-hidden="true">
        {tone === 'ok' ? '✓' : tone === 'info' ? 'i' : '!'}
      </div>
      <h2 style={{ fontSize: 26, fontWeight: 700 }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75, color: 'var(--neutral-ink)' }}>{body}</p>
      {refId && (
        <div style={{ width: '100%', background: 'var(--ground)', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 14 }}>รหัสใบสมัคร</span>
          <span className="mono" style={{ fontSize: 17 }}>{refId}</span>
        </div>
      )}
      {action}
    </div>
  );
}
