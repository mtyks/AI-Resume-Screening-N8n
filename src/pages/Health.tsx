import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Candidate, SystemHealth } from '../api';
import { fmtShort, fmtStamp, useAsync } from '../lib';
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

/** แปลข้อความ error ทางเทคนิคเป็นภาษาที่ HR เข้าใจ พร้อมบอกว่าควรทำอะไรต่อ */
export function explainError(raw: string | null): { cause: string; action: string } {
  const t = (raw ?? '').toLowerCase();
  if (!t.trim()) return { cause: 'ระบบไม่ได้บันทึกสาเหตุไว้', action: 'กด “สแกนซ้ำ” ถ้ายังไม่สำเร็จให้แจ้งผู้ดูแลระบบ' };
  if (/ไม่พบตำแหน่ง|position/.test(t)) return { cause: 'ตำแหน่งที่ผู้สมัครเลือกไม่มีในระบบแล้ว (อาจถูกลบหรือเปลี่ยนชื่อ)', action: 'ตรวจที่หน้า “ตำแหน่งงาน” ว่ายังมีตำแหน่งนี้ แล้วกด “สแกนซ้ำ”' };
  if (/429|quota|rate|เกินโควต้า|too many/.test(t)) return { cause: 'บริการ AI ถูกใช้เกินโควต้าชั่วคราว', action: 'รอสักครู่แล้วกด “สแกนซ้ำ”' };
  if (/gemini|ai |ไม่ตอบสนอง|timeout|timed out|503|502|overload|etimedout|econn/.test(t)) return { cause: 'บริการ AI ไม่ตอบสนองหรือหมดเวลา', action: 'กด “สแกนซ้ำ” ในอีกสักครู่ ถ้าเกิดซ้ำหลายคนให้แจ้งผู้ดูแลระบบ' };
  if (/pdf|extract|อ่านไฟล์|resume|ข้อความ|empty|scan/.test(t)) return { cause: 'อ่านข้อความจากไฟล์ Resume ไม่ได้ (อาจเป็นไฟล์สแกนเป็นรูป ไฟล์เสียหรือมีรหัสผ่าน)', action: 'เปิดไฟล์ดูด้วยตนเอง หรือขอให้ผู้สมัครส่งไฟล์ PDF ที่เลือกข้อความได้' };
  if (/json|parse|รูปแบบ/.test(t)) return { cause: 'AI ตอบกลับในรูปแบบที่ระบบอ่านไม่ได้', action: 'กด “สแกนซ้ำ” ส่วนมากจะผ่านในครั้งถัดไป' };
  return { cause: 'ระบบประมวลผลไม่สำเร็จ (สาเหตุทางเทคนิค)', action: 'กด “สแกนซ้ำ” ถ้ายังไม่สำเร็จให้แจ้งผู้ดูแลระบบพร้อมรหัสผู้สมัคร' };
}

function minutesSince(iso: string): number { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); }
function waitText(m: number): string { return m < 60 ? `${m} นาที` : m < 1440 ? `${Math.floor(m / 60)} ชม. ${m % 60} นาที` : `${Math.floor(m / 1440)} วัน`; }

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

const WORDS: { k: string; v: string }[] = [
  { k: 'ประมวลผลแล้ว', v: 'ระบบอ่าน Resume และให้คะแนนเรียบร้อย HR เปิดดูผลได้ที่หน้าตำแหน่งงาน' },
  { k: 'รอประมวลผล', v: 'ใบสมัครเข้าระบบแล้วแต่ยังไม่ได้ให้คะแนน ปกติใช้เวลาไม่กี่นาที ถ้านานเกิน 15 นาทีถือว่าค้าง' },
  { k: 'ไม่สำเร็จ', v: 'ระบบพยายามแล้วแต่ให้คะแนนไม่ได้ ดูสาเหตุและกด “สแกนซ้ำ” ได้ในตารางด้านบน' },
  { k: 'ข้อผิดพลาด 24 ชม.', v: 'จำนวนครั้งที่ระบบบันทึกว่าเกิดข้อผิดพลาดใน 24 ชั่วโมงที่ผ่านมา (บางครั้งระบบลองใหม่เองจนสำเร็จ)' },
  { k: 'อีเมลสถานะรอส่ง / ส่งไม่สำเร็จ', v: 'อีเมลแจ้งผลการพิจารณาถึงผู้สมัคร “รอส่ง” คือยังอยู่ในคิว “ส่งไม่สำเร็จ” คือลองหลายครั้งแล้วแต่ส่งไม่ได้ (ตรวจการเชื่อมต่อ Gmail)' },
  { k: 'รอยืนยันรับใบสมัคร', v: 'อีเมลที่แจ้งผู้สมัครว่าได้รับใบสมัครแล้ว ซึ่งยังไม่ได้ส่ง' },
  { k: 'ครบกำหนดรอลบ (90 วัน)', v: 'ข้อมูลผู้สมัครที่เก็บครบ 90 วันตามนโยบาย PDPA ระบบจะลบอัตโนมัติรอบ 02:00 น.' }
];

/** HR/Admin: สถานะคิวประมวลผลและอีเมลของระบบ (อ่านจากฐานข้อมูล) */
export default function Health() {
  const h = useAsync(() => api.systemHealth(), []);
  const q = useAsync(() => api.listFailedCandidates(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const reloadH = h.reload;
  const reloadQ = q.reload;
  useEffect(() => { const id = setInterval(() => { reloadH(); reloadQ(); }, 60_000); return () => clearInterval(id); }, [reloadH, reloadQ]);
  const d = h.data;
  const issues = d ? healthIssues(d) : [];
  const todo: Candidate[] = (q.data ?? []).filter((c) => c.processing_status === 'failed' || (c.processing_status === 'pending' && minutesSince(c.received_at) > 15));
  const level: Tone = !d ? 'ok' : d.stuck > 0 ? 'err' : issues.length > 0 || todo.length > 0 ? 'warn' : 'ok';
  const headline = level === 'err' ? 'ระบบมีรายการค้าง ต้องตรวจสอบ' : level === 'warn' ? 'ระบบทำงานอยู่ แต่มีรายการที่ต้องดำเนินการ' : 'ระบบทำงานปกติ';

  async function retry(id: string) {
    setBusy(id); setMsg(null);
    try { await api.retryCandidate(id); setMsg('ส่งเข้าคิวสแกนซ้ำแล้ว ผลจะอัปเดตภายในไม่กี่นาที'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'สั่งสแกนซ้ำไม่สำเร็จ'); }
    setBusy(null); reloadH(); reloadQ();
  }

  return (
    <main className="page">
      <PageHead title="สถานะการประมวลผลของระบบ" sub="ดูว่าใบสมัครถูกประมวลผลครบหรือไม่ อะไรผิดพลาด และต้องทำอะไรต่อ รีเฟรชอัตโนมัติทุก 1 นาที">
        <button type="button" className="btn small" onClick={() => { h.reload(); q.reload(); }}>รีเฟรช</button>
      </PageHead>
      {h.error && <ErrorBox message={h.error} />}
      {h.loading && !d && <Loading />}
      {d && (
        <>
          <div role={level === 'err' ? 'alert' : 'status'} className={`alert ${level}`} style={{ fontSize: 16 }}>
            <b>{headline}</b>
            <div style={{ fontWeight: 400, marginTop: 2 }}>
              {level === 'ok' ? `ใบสมัครทั้งหมด ${d.total} ใบ ประมวลผลแล้ว ${d.processed} ใบ ไม่มีรายการค้างหรือล้มเหลว` : `ประมวลผลแล้ว ${d.processed} จาก ${d.total} ใบ · รอ ${d.pending} · ไม่สำเร็จ ${d.failed}`}
            </div>
          </div>

          <section className="card" style={{ padding: '14px 18px', borderRadius: 12 }} aria-labelledby="todo-h">
            <h2 id="todo-h" style={{ margin: '0 0 8px', fontSize: 18 }}>รายการที่ต้องดำเนินการ ({todo.length})</h2>
            {msg && <div role="status" className="alert ok" style={{ marginBottom: 8 }}>{msg}</div>}
            {q.loading && !q.data ? <Loading /> : todo.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>ไม่มีใบสมัครที่ค้างหรือประมวลผลไม่สำเร็จ</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {todo.map((c) => {
                  const failed = c.processing_status === 'failed';
                  const e = failed ? explainError(c.processing_error) : { cause: 'รอคิวนานกว่าปกติ ระบบประมวลผลอัตโนมัติ (n8n) อาจหยุดทำงานหรือคิวยาว', action: 'รอสักครู่ ถ้ายังค้างให้แจ้งผู้ดูแลระบบตรวจเครื่องที่รัน n8n' };
                  return (
                    <div key={c.candidate_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'start', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                      <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <Link to={`/candidate/${c.candidate_id}`}><b>{c.full_name}</b></Link>
                          <span className="muted" style={{ fontSize: 13.5 }}>{c.applied_position} · สมัครเมื่อ {fmtShort(c.received_at)}</span>
                          <span className={`pill ${failed ? 'failed' : 'pending'}`}>{failed ? 'ไม่สำเร็จ' : `รอมา ${waitText(minutesSince(c.received_at))}`}</span>
                        </div>
                        <div style={{ fontSize: 14.5 }}><b>สาเหตุ:</b> {e.cause}</div>
                        <div style={{ fontSize: 14.5 }}><b>ควรทำ:</b> {e.action}</div>
                        {failed && c.processing_error && (
                          <details style={{ fontSize: 13 }}><summary className="muted" style={{ cursor: 'pointer' }}>ข้อความทางเทคนิค (ใช้แจ้งผู้ดูแลระบบ)</summary>
                            <div style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{c.candidate_id}: {c.processing_error}</div></details>
                        )}
                      </div>
                      <button type="button" className="btn small" disabled={busy === c.candidate_id} onClick={() => void retry(c.candidate_id)}>{busy === c.candidate_id ? 'กำลังส่ง…' : 'สแกนซ้ำ'}</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {issues.filter((i) => !/^มี \d+ คน(รอเกิน|ที่ประมวลผลไม่สำเร็จ)/.test(i.text)).map((i, k) => <div key={k} role="status" className={`alert ${i.tone}`}>{i.text}{i.text.includes('คำขอลบ') && <> · <Link to="/requests">เปิดหน้าคำขอ</Link></>}</div>)}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
            <Stat label="ผู้สมัครทั้งหมด" value={d.total} />
            <Stat label="ประมวลผลแล้ว" value={d.processed} hint="ให้คะแนนเรียบร้อย" />
            <Stat label="รอประมวลผล" value={d.pending} tone={d.stuck > 0 ? 'err' : 'ok'} hint={d.stuck > 0 ? `ค้างเกิน 15 นาที ${d.stuck} คน` : 'อยู่ในคิวตามปกติ'} />
            <Stat label="ไม่สำเร็จ" value={d.failed} tone={d.failed > 0 ? 'warn' : 'ok'} hint={d.failed > 0 ? 'ดูสาเหตุในตารางด้านบน' : undefined} />
            <Stat label="ข้อผิดพลาด 24 ชม." value={d.errors_24h} tone={d.errors_24h > 0 ? 'warn' : 'ok'} hint="จำนวนครั้งที่ระบบบันทึก error" />
            <Stat label="อีเมลสถานะรอส่ง" value={d.outbox_waiting} hint="อีเมลแจ้งผลถึงผู้สมัคร" />
            <Stat label="อีเมลสถานะส่งไม่สำเร็จ" value={d.outbox_failed} tone={d.outbox_failed > 0 ? 'warn' : 'ok'} hint={d.outbox_failed > 0 ? 'ตรวจการเชื่อมต่อ Gmail' : undefined} />
            <Stat label="รอยืนยันรับใบสมัคร" value={d.receipt_waiting} hint="อีเมลที่ n8n ยังไม่ได้ส่ง" />
            <Stat label="ครบกำหนดรอลบ (90 วัน)" value={d.next_purge_count} hint="ถูกลบรอบ 02:00 น." />
          </div>

          <div className="card" style={{ padding: '14px 18px', borderRadius: 12, fontSize: 14.5, lineHeight: 1.9 }}>
            <div>ประมวลผลสำเร็จล่าสุด: <b>{d.last_processed_at ? fmtStamp(d.last_processed_at) : 'ยังไม่มี'}</b></div>
            <div>บันทึกความสำเร็จล่าสุดของ n8n: <b>{d.last_success_log_at ? fmtStamp(d.last_success_log_at) : 'ยังไม่มี'}</b></div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>หน้านี้อ่านจากฐานข้อมูล ไม่ได้ตรวจว่า n8n เปิดอยู่โดยตรง ถ้าไม่มีผู้สมัครใหม่ เวลาล่าสุดย่อมไม่เปลี่ยน สัญญาณที่บอกว่า n8n มีปัญหาคือ “รอประมวลผลค้าง”</div>
          </div>

          <details className="card" style={{ padding: '12px 18px', borderRadius: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>แต่ละตัวเลขหมายความว่าอะไร</summary>
            <dl style={{ margin: '10px 0 0', display: 'grid', gap: 8, fontSize: 14.5 }}>
              {WORDS.map((w) => <div key={w.k}><dt style={{ fontWeight: 600 }}>{w.k}</dt><dd style={{ margin: 0 }} className="muted">{w.v}</dd></div>)}
            </dl>
          </details>
        </>
      )}
    </main>
  );
}
