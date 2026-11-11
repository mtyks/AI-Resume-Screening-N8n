import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { isEmail } from '../lib';

/** หน้าสาธารณะ: ผู้สมัครขอลบข้อมูลส่วนบุคคล (PDPA) ระบบตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้เคยสมัครหรือไม่ */
export default function DataRequest() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bad = email !== '' && !isEmail(email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) { setErr('กรุณากรอกอีเมลให้ถูกต้อง'); return; }
    setBusy(true); setErr(null);
    try { await api.submitDataRequest({ email: email.trim(), name: name.trim() || undefined, note: note.trim() || undefined }); setDone(true); }
    catch (x) { setErr(x instanceof Error ? x.message : 'ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { setBusy(false); }
  }

  return (
    <main style={{ display: 'flex', justifyContent: 'center', padding: 'clamp(20px, 4vw, 56px)' }}>
      <div className="formcard">
        {done ? (
          <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700 }}>รับคำขอแล้ว</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75 }}>เจ้าหน้าที่จะตรวจสอบและลบข้อมูลที่เกี่ยวข้องกับอีเมลนี้ หากมี ระบบเก็บข้อมูลไม่เกิน 90 วันและลบเองอัตโนมัติอยู่แล้ว</p>
            <Link className="btn" to="/">กลับหน้าสมัครงาน</Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 700 }}>ขอลบข้อมูลส่วนบุคคล</h2>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 15, lineHeight: 1.7 }}>ใช้เมื่อต้องการให้ลบใบสมัครและไฟล์ Resume ของคุณก่อนครบ 90 วัน กรอกอีเมลที่ใช้สมัครงาน</p>
            </div>
            <div className="field">
              <label htmlFor="dr_email">อีเมลที่ใช้สมัคร</label>
              <input id="dr_email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={bad ? 'true' : undefined} />
              {bad && <span className="err">รูปแบบอีเมลไม่ถูกต้อง</span>}
            </div>
            <div className="field">
              <label htmlFor="dr_name">ชื่อ-นามสกุล (ไม่บังคับ)</label>
              <input id="dr_name" className="input" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dr_note">หมายเหตุ (ไม่บังคับ)</label>
              <textarea id="dr_note" className="input" rows={3} maxLength={1000} style={{ height: 'auto', padding: 12 }} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {err && <div role="alert" className="alert err">{err}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่งคำขอ'}</button>
              <Link className="btn" to="/">ยกเลิก</Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
