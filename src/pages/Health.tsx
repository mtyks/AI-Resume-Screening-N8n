import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { SystemHealth } from '../api';
import { fmtStamp, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

type Tone = 'ok' | 'warn' | 'err';

function Stat({ label, value, tone = 'ok', hint }: { label: string; value: string | number; tone?: Tone; hint?: string }) {
  const col = tone === 'err' ? 'var(--danger-ink)' : tone === 'warn' ? 'var(--warn-bar)' : 'var(--ink)';
  return (
    <div className="card" style={{ padding: '14px 18px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{label}</span>
      <b style={{ fontFamily: 'var(--display)', fontSize: 30, color: col }}>{value}</b>
      {hint && <span className="muted" style={{ fontSize: 12.5 }}>{hint}</span>}
    </div>
  );
}

/** สรุปปัญหาที่ต้องทำอะไรสักอย่าง เรียงตามความรุนแรง */
export function healthIssues(h: SystemHealth): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];
  if (h.stuck > 0) out.push({ tone: 'err', text: `มี ${h.stuck} คนรอเกิน 15 นาที (นานสุด ${h.oldest_pending_minutes} นาที) ตรวจว่าเครื่องที่รัน n8n เปิดอยู่ ngrok ยังทำงาน และ workflow เปิดใช้งาน` });
  if (h.failed > 0) out.push({ tone: 'warn', text: `มี ${h.failed} คนที่ประมวลผลไม่สำเร็จ ดูสาเหตุและกด “สแกนซ้ำ” ได้ที่หน้าบันทึกการทำงานของระบบ (Admin) หรือหน้ารายละเอียดผู้สมัคร` });
  if (h.errors_24h > 0) out.push({ tone: 'warn', text: `มีข้อผิดพลาดในบันทึกการทำงาน ${h.errors_24h} ครั้งใน 24 ชั่วโมง` });
  if (h.outbox_failed > 0) out.push({ tone: 'warn', text: `อีเมลแจ้งสถานะส่งไม่สำเร็จซ้ำหลายครั้ง ${h.outbox_failed} ฉบับ (ตรวจการเชื่อมต่อ Gmail ใน n8n)` });
  if (h.open_data_requests > 0) out.push({ tone: 'warn', text: `มีคำขอลบข้อมูลรอดำเนินการ ${h.open_data_requests} รายการ` });
  return out;
}

/** HR/Admin: สถานะคิวประมวลผลและอีเมลของระบบ (อ่านจากฐานข้อมูล) */
export default function Health() {
  const h = useAsync(() => api.systemHealth(), []);
  const reload = h.reload;
  useEffect(() => { const id = setInterval(reload, 60_000); return () => clearInterval(id); }, [reload]);
  const d = h.data;
  const issues = d ? healthIssues(d) : [];
  return (
    <main className="page">
      <PageHead title="สถานะการประมวลผลของระบบ" sub="สรุปคิวประมวลผลและอีเมล รีเฟรชอัตโนมัติทุก 1 นาที">
        <button type="button" className="btn small" onClick={() => h.reload()}>รีเฟรช</button>
      </PageHead>
      {h.error && <ErrorBox message={h.error} />}
      {h.loading && !d && <Loading />}
      {d && (
        <>
          {issues.length === 0
            ? <div role="status" className="alert ok">ไม่พบปัญหา ณ ตอนนี้: ไม่มีรายการค้างหรือล้มเหลว</div>
            : issues.map((i, k) => <div key={k} role={i.tone === 'err' ? 'alert' : 'status'} className={`alert ${i.tone}`}>{i.text}{i.text.includes('คำขอลบ') && <> · <Link to="/requests">เปิดหน้าคำขอ</Link></>}</div>)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
            <Stat label="ผู้สมัครทั้งหมด" value={d.total} />
            <Stat label="ประมวลผลแล้ว" value={d.processed} />
            <Stat label="รอประมวลผล" value={d.pending} tone={d.stuck > 0 ? 'err' : 'ok'} hint={d.stuck > 0 ? `ค้าง ${d.stuck}` : undefined} />
            <Stat label="ไม่สำเร็จ" value={d.failed} tone={d.failed > 0 ? 'warn' : 'ok'} />
            <Stat label="ข้อผิดพลาด 24 ชม." value={d.errors_24h} tone={d.errors_24h > 0 ? 'warn' : 'ok'} />
            <Stat label="อีเมลสถานะรอส่ง" value={d.outbox_waiting} />
            <Stat label="อีเมลสถานะส่งไม่สำเร็จ" value={d.outbox_failed} tone={d.outbox_failed > 0 ? 'warn' : 'ok'} />
            <Stat label="รอยืนยันรับใบสมัคร" value={d.receipt_waiting} hint="อีเมลที่ n8n ยังไม่ได้ส่ง" />
            <Stat label="ครบกำหนดรอลบ (90 วัน)" value={d.next_purge_count} hint="ถูกลบรอบ 02:00 น." />
          </div>
          <div className="card" style={{ padding: '14px 18px', borderRadius: 12, fontSize: 14.5, lineHeight: 1.9 }}>
            <div>ประมวลผลสำเร็จล่าสุด: <b>{d.last_processed_at ? fmtStamp(d.last_processed_at) : 'ยังไม่มี'}</b></div>
            <div>บันทึกความสำเร็จล่าสุดของ n8n: <b>{d.last_success_log_at ? fmtStamp(d.last_success_log_at) : 'ยังไม่มี'}</b></div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>หน้านี้อ่านจากฐานข้อมูล ไม่ได้ตรวจว่า n8n เปิดอยู่โดยตรง ถ้าไม่มีผู้สมัครใหม่ เวลาล่าสุดย่อมไม่เปลี่ยน สัญญาณที่บอกว่า n8n มีปัญหาคือ “รอประมวลผลค้าง”</div>
          </div>
        </>
      )}
    </main>
  );
}
