import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AuditEntry } from '../api';
import { STATUS_LABEL, fmtStamp, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

const COLS = '170px 210px 190px minmax(0,1fr)';

/** ชื่อการกระทำที่แสดง (เรียงตามที่ปุ่มกรอง) */
const LABEL: Record<string, string> = {
  status_change: 'เปลี่ยนสถานะผู้สมัคร',
  note_edit: 'แก้โน้ตผู้สมัคร',
  rescan: 'สั่งสแกนซ้ำ',
  candidate_removed: 'ลบผู้สมัคร',
  export_csv: 'ส่งออก CSV',
  job_create: 'เพิ่มตำแหน่งงาน',
  job_update: 'แก้ตำแหน่งงาน/เกณฑ์',
  job_delete: 'ลบตำแหน่งงาน',
  user_add: 'เพิ่มผู้ใช้',
  user_role: 'เปลี่ยนบทบาทผู้ใช้',
  user_remove: 'ลบผู้ใช้',
  config_change: 'เปลี่ยนค่าตั้งระบบ'
};

/** การกระทำที่ target คือรหัสผู้สมัครและยังกดไปดูได้ */
const CANDIDATE_ACTIONS = new Set(['status_change', 'note_edit', 'rescan']);

const FIELD_LABEL: Record<string, string> = {
  position_name: 'ชื่อตำแหน่ง', must_have_skills: 'ทักษะที่ต้องมี', preferred_skills: 'ทักษะที่ควรมี', required_tools: 'เครื่องมือ',
  min_experience_years: 'ประสบการณ์ขั้นต่ำ', weight_musthave: 'น้ำหนักทักษะที่ต้องมี', weight_preferred: 'น้ำหนักทักษะที่ควรมี', weight_tool: 'น้ำหนักเครื่องมือ',
  match_threshold: 'เกณฑ์ผ่าน', is_active: 'เปิดรับ', open_at: 'วันเปิดรับ', close_at: 'วันปิดรับ', description: 'รายละเอียดตำแหน่ง'
};

function fmtVal(k: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'ไม่ระบุ';
  if (k.startsWith('weight_')) return `${Math.round(Number(v) * 100)}%`;
  if (k === 'is_active') return v ? 'เปิด' : 'ปิด';
  if (k === 'open_at' || k === 'close_at') return fmtStamp(String(v)).slice(0, 16);
  if (k === 'min_experience_years') return `${String(v)} ปี`;
  return String(v);
}

/** อธิบายรายละเอียดการกระทำเป็นภาษาคน */
export function describeAudit(e: AuditEntry): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const st = (s: unknown) => STATUS_LABEL[String(s)] ?? String(s ?? '');
  switch (e.action) {
    case 'status_change': return `${st(d.from)} → ${st(d.to)}`;
    case 'export_csv': return `${e.target ?? ''} (${String(d.rows ?? '?')} แถว)`;
    case 'job_create': return String(d.name ?? '');
    case 'job_delete': return String(d.name ?? '');
    case 'job_update': {
      const changes = (d.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      const fields = Array.isArray(d.fields) ? (d.fields as string[]) : Object.keys(changes);
      const parts = fields.map((k) => {
        const c = changes[k];
        return c ? `${FIELD_LABEL[k] ?? k}: ${fmtVal(k, c.from)} → ${fmtVal(k, c.to)}` : `${FIELD_LABEL[k] ?? k} (แก้ไขแล้ว)`;
      });
      return `${String(d.name ?? '')} · ${parts.join(' · ')}`;
    }
    case 'user_add': return `${e.target ?? ''} เป็น ${String(d.role ?? '')}`;
    case 'user_remove': return `${e.target ?? ''} (${String(d.role ?? '')})`;
    case 'user_role': return `${e.target ?? ''}: ${String(d.from ?? '')} → ${String(d.to ?? '')}`;
    case 'config_change': return `${e.target ?? ''}: ${String(d.from ?? '')} → ${String(d.to ?? '')}`;
    default: return '';
  }
}

export default function Audit() {
  const list = useAsync(() => api.listAudit(), []);
  const [f, setF] = useState<'all' | string>('all');
  const [who, setWho] = useState('');
  const all = list.data ?? [];
  const actors = useMemo(() => [...new Set(all.map((e) => e.actor))].sort((a, b) => a.localeCompare(b)), [all]);
  const shown = all.filter((e) => (f === 'all' || e.action === f) && (!who || e.actor === who));
  const present = new Set(all.map((e) => e.action));

  return (
    <main className="page">
      <PageHead title="ประวัติการใช้งาน" sub="ดูได้ว่าใครทำอะไรและเมื่อไร เช่น เปลี่ยนสถานะ แก้โน้ต สั่งสแกนซ้ำ ลบผู้สมัคร ส่งออก CSV แก้เกณฑ์ตำแหน่งงาน และจัดการผู้ใช้ (แสดง 500 รายการล่าสุด ไม่เก็บเนื้อหาข้อมูลส่วนตัว)" />
      {list.error && <ErrorBox message={list.error} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label className="sortsel">
          <span className="muted">ผู้ทำ</span>
          <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="กรองตามผู้ทำ">
            <option value="">ทุกคน</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div role="group" aria-label="กรองตามการกระทำ" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="tab" aria-pressed={f === 'all'} onClick={() => setF('all')}>ทั้งหมด</button>
          {Object.entries(LABEL).filter(([k]) => present.has(k) || f === k).map(([k, v]) => (
            <button key={k} type="button" className="tab" aria-pressed={f === k} onClick={() => setF(k)}>{v}</button>
          ))}
        </div>
      </div>
      {list.loading && !list.data ? <Loading /> : (
        <div className="table-wrap">
          <div className="inner">
            <div className="trow head" style={{ gridTemplateColumns: COLS }}><span>เวลา</span><span>ผู้ทำ</span><span>การกระทำ</span><span>รายละเอียด</span></div>
            {shown.length === 0 && <div className="empty" style={{ border: 'none' }}>ยังไม่มีประวัติ</div>}
            {shown.map((e) => (
              <div className="trow" style={{ gridTemplateColumns: COLS }} key={e.id}>
                <span className="mono muted" style={{ fontSize: 13.5 }}>{fmtStamp(e.at)}</span>
                <span style={{ overflowWrap: 'anywhere' }}>{e.actor}</span>
                <span>{LABEL[e.action] ?? e.action}</span>
                <span style={{ overflowWrap: 'anywhere' }}>
                  {e.target && CANDIDATE_ACTIONS.has(e.action) && <Link className="mono" to={`/candidate/${e.target}`} style={{ marginRight: 10 }}>{e.target}</Link>}
                  {e.target && e.action === 'candidate_removed' && <span className="mono" style={{ marginRight: 10 }}>{e.target}</span>}
                  {describeAudit(e)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
