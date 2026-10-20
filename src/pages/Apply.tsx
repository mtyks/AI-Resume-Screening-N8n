import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { SubmitResult } from '../api';
import { useAsync } from '../lib';
import { Mark } from '../ui';

const EXP = ['ไม่มีประสบการณ์ (นักศึกษาจบใหม่)', '1-3 ปี', '3-5 ปี', 'มากกว่า 5 ปี'];

type Errors = Partial<Record<'full_name' | 'phone_number' | 'email' | 'applied_position' | 'exp' | 'resume' | 'consent', string>>;

export default function Apply() {
  const jobs = useAsync(() => api.listOpenPositions(), []);
  const [form, setForm] = useState({ full_name: '', phone_number: '', email: '', applied_position: '' });
  const [exp, setExp] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(): Errors {
    const e: Errors = {};
    if (!form.full_name.trim()) e.full_name = 'กรุณากรอกชื่อ-นามสกุล';
    if (form.phone_number.replace(/\D/g, '').length < 9) e.phone_number = 'กรุณากรอกเบอร์โทรให้ครบ';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (!form.applied_position) e.applied_position = 'กรุณาเลือกตำแหน่ง';
    if (!exp) e.exp = 'กรุณาเลือกช่วงประสบการณ์ทำงาน';
    if (!file) e.resume = 'กรุณาแนบไฟล์ Resume (PDF)';
    else if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) e.resume = 'ไฟล์ต้องเป็น PDF เท่านั้น';
    if (!consent) e.consent = 'กรุณายินยอมก่อนส่งใบสมัคร';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length || !file) return;
    setBusy(true);
    try {
      setResult(await api.submitApplication({ ...form, self_reported_experience_range: exp, resume: file }));
    } catch {
      setResult({ status: 'error', message: 'ระบบขัดข้องชั่วคราว' });
    } finally {
      setBusy(false);
    }
  }

  const bad = (k: keyof Errors) => (errors[k] ? 'true' : undefined);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: '100vh' }}>
      <aside style={{ flex: '1 1 420px', background: 'var(--nav)', color: '#fff', padding: '56px', display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 17, fontWeight: 600 }}><Mark size={36} /> Resume Screening</div>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.25, fontWeight: 700, margin: '0 0 16px' }}>ฝาก Resume ของคุณไว้กับเรา</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, color: 'var(--nav-muted)' }}>กรอกข้อมูลพื้นฐานและแนบ Resume เป็นไฟล์ PDF ระบบจะอ่านและเทียบกับคุณสมบัติของตำแหน่ง ก่อนส่งต่อให้ฝ่ายบุคคลพิจารณา</p>
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 440 }}>
          {['กรอกข้อมูลติดต่อ เลือกตำแหน่ง และแนบ Resume (PDF)', 'ระบบอ่าน Resume และประเมินความตรงกับตำแหน่งโดยอัตโนมัติ', 'ฝ่ายบุคคลตรวจสอบผลและติดต่อกลับทางอีเมลหรือเบอร์โทร'].map((t, i) => (
            <li key={t} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <span style={{ flex: '0 0 32px', height: 32, borderRadius: '50%', border: '1.5px solid #5fb8a0', color: '#9fe0cc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>{i + 1}</span>
              <span style={{ fontSize: 16, lineHeight: 1.6, paddingTop: 3 }}>{t}</span>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 'auto', fontSize: 14, color: 'var(--nav-muted)', lineHeight: 1.6 }}>
          ข้อมูลของคุณใช้เพื่อการพิจารณาสมัครงานเท่านั้น · <span>[ลิงก์นโยบายข้อมูลส่วนบุคคล]</span>
          <div style={{ marginTop: 10 }}><Link to="/login" style={{ color: '#9fe0cc' }}>สำหรับเจ้าหน้าที่ HR →</Link></div>
        </div>
      </aside>

      <main style={{ flex: '1.3 1 560px', minWidth: 0, padding: '56px 48px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div className="card" style={{ width: '100%', maxWidth: 600, padding: 40 }}>
          {!result && (
            <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700 }}>ใบสมัครงาน</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>ช่องที่มี * ต้องกรอก</p>
              </div>

              <div className="field">
                <label htmlFor="full_name">ชื่อ-นามสกุล *</label>
                <input id="full_name" className="input" autoComplete="name" value={form.full_name} onChange={set('full_name')} aria-invalid={bad('full_name')} placeholder="เช่น สมหญิง ใจดี" />
                {errors.full_name && <span className="err">{errors.full_name}</span>}
              </div>

              <div className="grid2">
                <div className="field">
                  <label htmlFor="phone">เบอร์โทรศัพท์ *</label>
                  <input id="phone" className="input" type="tel" autoComplete="tel" value={form.phone_number} onChange={set('phone_number')} aria-invalid={bad('phone_number')} placeholder="08x-xxx-xxxx" />
                  {errors.phone_number && <span className="err">{errors.phone_number}</span>}
                </div>
                <div className="field">
                  <label htmlFor="email">อีเมล *</label>
                  <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={bad('email')} placeholder="name@example.com" />
                  {errors.email && <span className="err">{errors.email}</span>}
                </div>
              </div>

              <div className="field">
                <label htmlFor="pos">ตำแหน่งที่สมัคร *</label>
                <select id="pos" className="select" value={form.applied_position} onChange={set('applied_position')} aria-invalid={bad('applied_position')}>
                  <option value="">{jobs.loading ? 'กำลังโหลด…' : 'เลือกตำแหน่ง'}</option>
                  {jobs.data?.map((j) => <option key={j.job_id} value={j.position_name}>{j.position_name}</option>)}
                </select>
                <span className="hint">{jobs.data && jobs.data.length === 0 ? 'ขณะนี้ยังไม่มีตำแหน่งที่เปิดรับสมัคร' : 'แสดงเฉพาะตำแหน่งที่เปิดรับสมัครอยู่'}</span>
                {(() => {
                  const p = jobs.data?.find((j) => j.position_name === form.applied_position);
                  if (!p) return null;
                  const list = (label: string, items: string[]) => items.length > 0 && <div><b>{label}:</b> {items.join(', ')}</div>;
                  return (
                    <div className="alert" style={{ fontSize: 14.5, lineHeight: 1.7, background: '#f3f1e8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {p.description && <div>{p.description}</div>}
                      <div><b>ประสบการณ์ขั้นต่ำที่ต้องการ:</b> {p.min_experience_years > 0 ? `${p.min_experience_years} ปีขึ้นไป` : 'ไม่กำหนด (รับนักศึกษาจบใหม่)'}</div>
                      {list('ทักษะที่ต้องมี', p.must_have_skills)}
                      {list('ทักษะที่ควรมี', p.preferred_skills)}
                      {list('เครื่องมือ', p.required_tools)}
                      {p.close_at && <div><b>ปิดรับสมัคร:</b> {new Date(p.close_at).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })}</div>}
                    </div>
                  );
                })()}
                {errors.applied_position && <span className="err">{errors.applied_position}</span>}
              </div>

              <div role="group" aria-labelledby="exp_label" className="field">
                <span id="exp_label" className="label">ประสบการณ์ทำงานโดยประมาณ *</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {EXP.map((x) => (
                    <button key={x} type="button" aria-pressed={exp === x} onClick={() => setExp(exp === x ? null : x)}
                      style={{ height: 44, padding: '0 20px', borderRadius: 22, fontSize: 15, fontWeight: 500, cursor: 'pointer', border: `1px solid ${exp === x ? 'var(--accent)' : 'var(--input-border)'}`, background: exp === x ? 'var(--accent)' : '#fff', color: exp === x ? '#fff' : 'var(--ink)' }}>
                      {x}
                    </button>
                  ))}
                </div>
                {errors.exp && <span className="err">{errors.exp}</span>}
              </div>

              <div className="field">
                <label htmlFor="resume">ไฟล์ Resume (PDF) *</label>
                <div style={{ border: '1.5px dashed var(--input-border)', borderRadius: 12, background: '#f8f8f5', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" /></svg>
                  <span style={{ fontSize: 15 }}>{file ? file.name : 'เลือกไฟล์ PDF จากเครื่องของคุณ'}</span>
                  <input id="resume" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-invalid={bad('resume')} style={{ fontSize: 14, maxWidth: '100%' }} />
                </div>
                <span className="hint">รองรับทั้ง PDF ที่เป็นตัวอักษรและ PDF ที่สแกนจากภาพ</span>
                {errors.resume && <span className="err">{errors.resume}</span>}
              </div>

              <div className="field">
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.6, cursor: 'pointer', fontWeight: 400 }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, margin: '2px 0 0', accentColor: 'var(--accent)', flex: '0 0 22px' }} />
                  <span>ฉันยินยอมให้เก็บและใช้ข้อมูลในใบสมัครเพื่อการพิจารณาสมัครงาน</span>
                </label>
                {errors.consent && <span className="err">{errors.consent}</span>}
              </div>

              <button className="btn primary" type="submit" disabled={busy} style={{ height: 52, fontSize: 17, borderRadius: 12 }}>
                {busy ? 'กำลังส่ง…' : 'ส่งใบสมัคร'}
              </button>
            </form>
          )}

          {result?.status === 'received' && (
            <Outcome tone="ok" title="เราได้รับใบสมัครของคุณแล้ว"
              body="ระบบกำลังอ่าน Resume ของคุณ ฝ่ายบุคคลจะตรวจสอบและติดต่อกลับทางอีเมลหรือเบอร์โทรที่ให้ไว้"
              refId={result.candidate_id}
              action={<button className="btn" onClick={() => { setResult(null); setForm({ full_name: '', phone_number: '', email: '', applied_position: '' }); setExp(null); setFile(null); setConsent(false); }}>ส่งใบสมัครอีกตำแหน่ง</button>} />
          )}
          {result?.status === 'duplicate' && (
            <Outcome tone="info" title="คุณเคยสมัครตำแหน่งนี้ไว้แล้ว"
              body={`อีเมลนี้มีใบสมัครตำแหน่ง ${form.applied_position} อยู่ในระบบแล้ว ไม่ต้องส่งซ้ำ ฝ่ายบุคคลจะติดต่อกลับตามขั้นตอนปกติ หากต้องการสมัครตำแหน่งอื่นสามารถกลับไปแก้ฟอร์มได้`}
              refId={result.candidate_id}
              action={<button className="btn primary" onClick={() => setResult(null)}>กลับไปแก้ฟอร์ม</button>} />
          )}
          {result?.status === 'error' && (
            <Outcome tone="err" title="ส่งใบสมัครไม่สำเร็จ"
              body={`${result.message} — ข้อมูลที่คุณกรอกยังอยู่ครบ ลองส่งอีกครั้งได้เลย`}
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
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: color[0], display: 'flex', alignItems: 'center', justifyContent: 'center', color: color[1], fontSize: 28, fontWeight: 700 }} aria-hidden="true">
        {tone === 'ok' ? '✓' : tone === 'info' ? 'i' : '!'}
      </div>
      <h2 style={{ fontSize: 26, fontWeight: 700 }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7, color: 'var(--neutral-ink)' }}>{body}</p>
      {refId && (
        <div style={{ width: '100%', background: 'var(--ground)', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 14 }}>รหัสใบสมัคร</span>
          <span className="mono" style={{ fontSize: 17 }}>{refId}</span>
        </div>
      )}
      {action}
    </div>
  );
}
