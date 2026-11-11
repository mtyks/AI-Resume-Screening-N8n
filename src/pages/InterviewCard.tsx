import { useState } from 'react';
import { api } from '../api';
import type { Candidate, Interview } from '../api';
import { useAsync } from '../lib';

/** แปลงเวลา (ISO) เป็นค่าสำหรับ <input type="datetime-local"> ตามเวลาเครื่อง */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fmt = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' });

/** นัดสัมภาษณ์: ตั้งวันเวลา สถานที่/ลิงก์ แล้วระบบส่งอีเมลยืนยันพร้อมไฟล์ปฏิทินให้ผู้สมัคร */
export function InterviewCard({ c, onChanged }: { c: Candidate; onChanged: () => void }) {
  const cur = useAsync(() => api.getInterview(c.candidate_id), [c.candidate_id]);
  const iv: Interview | null = cur.data ?? null;
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<'onsite' | 'online'>('onsite');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canMail = Boolean(c.email);

  function open(from: Interview | null) {
    setWhen(from ? toLocalInput(from.starts_at) : '');
    setDuration(from?.duration_min ?? 60);
    setMode(from?.mode ?? 'onsite');
    setPlace(from?.location ?? '');
    setNote(from?.note ?? '');
    setMsg(null);
    setEditing(true);
  }

  async function save() {
    if (!when) { setMsg({ ok: false, text: 'เลือกวันและเวลาก่อน' }); return; }
    const at = new Date(when);
    if (at.getTime() < Date.now()) { setMsg({ ok: false, text: 'เลือกวันเวลาในอนาคต' }); return; }
    if (mode === 'online' && place.trim() && !/^https?:\/\//i.test(place.trim())) { setMsg({ ok: false, text: 'ลิงก์ประชุมออนไลน์ต้องขึ้นต้นด้วย https://' }); return; }
    if (notify && canMail && !window.confirm(`บันทึกนัด ${fmt(at.toISOString())} และส่งอีเมลยืนยันไปที่ ${c.email} ?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.scheduleInterview(c.candidate_id, { starts_at: at.toISOString(), duration_min: duration, mode, location: place.trim(), note: note.trim() }, notify && canMail);
      setEditing(false);
      setMsg({ ok: true, text: notify && canMail ? 'บันทึกนัดแล้ว อีเมลยืนยันเข้าคิวแล้ว (ส่งภายใน ~3 นาที)' : 'บันทึกนัดแล้ว (ไม่ได้ส่งอีเมล)' });
      cur.reload();
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกนัดไม่สำเร็จ' });
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!iv) return;
    if (!window.confirm(canMail ? `ยกเลิกนัดนี้และแจ้งผู้สมัครทางอีเมล (${c.email}) ?` : 'ยกเลิกนัดนี้ ?')) return;
    setBusy(true);
    try {
      await api.cancelInterview(iv.id, canMail);
      setMsg({ ok: true, text: canMail ? 'ยกเลิกนัดแล้ว อีเมลแจ้งยกเลิกเข้าคิวแล้ว' : 'ยกเลิกนัดแล้ว' });
      cur.reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'ยกเลิกนัดไม่สำเร็จ' });
    } finally { setBusy(false); }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 19, fontWeight: 500 }}>นัดสัมภาษณ์</h2>
        {!editing && <button type="button" className="btn small" onClick={() => open(iv)}>{iv ? 'เลื่อนนัด / แก้ไข' : 'นัดสัมภาษณ์'}</button>}
      </div>

      {!editing && cur.loading && !cur.data && <span className="muted">กำลังโหลด…</span>}
      {!editing && !cur.loading && !iv && <span className="muted">ยังไม่มีนัด กด “นัดสัมภาษณ์” เพื่อเลือกวันเวลา ระบบจะส่งอีเมลยืนยันพร้อมไฟล์ปฏิทินให้ผู้สมัคร</span>}
      {!editing && iv && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{fmt(iv.starts_at)}</div>
          <div className="muted">{iv.duration_min} นาที · {iv.mode === 'online' ? 'ออนไลน์' : 'ที่บริษัท/สถานที่นัด'}{iv.location ? ` · ${iv.location}` : ''}</div>
          {iv.note && <div style={{ fontSize: 14.5 }}>{iv.note}</div>}
          <div className={`pill ${iv.confirm_sent_at ? 'pass' : iv.attempts >= 5 ? 'gate' : 'pending'}`} style={{ alignSelf: 'flex-start' }}>
            {iv.confirm_sent_at ? 'ส่งอีเมลยืนยันแล้ว' : iv.attempts >= 5 ? 'ส่งอีเมลไม่สำเร็จ' : 'อีเมลรอส่ง'}
          </div>
          <div><button type="button" className="btn small" disabled={busy} onClick={() => void cancel()}>ยกเลิกนัด</button></div>
        </div>
      )}

      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="field">
            <label htmlFor="iv-when">วันและเวลา</label>
            <input id="iv-when" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="iv-dur">ระยะเวลา</label>
            <select id="iv-dur" className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} นาที</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="iv-mode">รูปแบบ</label>
            <select id="iv-mode" className="select" value={mode} onChange={(e) => setMode(e.target.value as 'onsite' | 'online')}>
              <option value="onsite">ที่บริษัท / สถานที่นัด</option>
              <option value="online">ออนไลน์</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="iv-place">{mode === 'online' ? 'ลิงก์ประชุม (Meet / Zoom / Teams)' : 'สถานที่'}</label>
            <input id="iv-place" className="input" maxLength={300} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={mode === 'online' ? 'https://meet.google.com/…' : 'เช่น ชั้น 5 ห้องประชุม A'} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="iv-note">ข้อความถึงผู้สมัคร (ไม่บังคับ)</label>
            <textarea id="iv-note" className="input" rows={2} maxLength={1000} style={{ height: 'auto', padding: '12px 14px' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โปรดเตรียมผลงานมาแสดง" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button type="submit" className="btn primary small" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกนัด'}</button>
            <button type="button" className="btn small" disabled={busy} onClick={() => setEditing(false)}>ยกเลิก</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={notify && canMail} disabled={!canMail} onChange={(e) => setNotify(e.target.checked)} /> ส่งอีเมลยืนยันถึงผู้สมัคร{!canMail && ' (ไม่มีอีเมล)'}
            </label>
          </div>
        </form>
      )}
      {msg && <div role="status" className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </section>
  );
}
