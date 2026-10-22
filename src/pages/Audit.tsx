import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AuditEntry } from '../api';
import { fmtStamp, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

const COLS = '180px 220px 190px minmax(0,1fr)';
const LABEL: Record<string, string> = {
  status_change: 'เปลี่ยนสถานะผู้สมัคร',
  note_edit: 'แก้โน้ตผู้สมัคร',
  candidate_removed: 'ลบผู้สมัคร',
  export_csv: 'ส่งออก CSV'
};

function describe(e: AuditEntry): string {
  const d = e.detail ?? {};
  if (e.action === 'status_change') return `${String(d.from ?? '')} → ${String(d.to ?? '')}`;
  if (e.action === 'export_csv') return `${e.target ?? ''} (${String(d.rows ?? '?')} แถว)`;
  return '';
}

export default function Audit() {
  const list = useAsync(() => api.listAudit(), []);
  const [f, setF] = useState<'all' | string>('all');
  const all = list.data ?? [];
  const shown = all.filter((e) => f === 'all' || e.action === f);

  return (
    <main className="page">
      <PageHead title="ประวัติการใช้งาน" sub="ใครเปลี่ยนสถานะ แก้โน้ต ลบผู้สมัคร หรือส่งออก CSV (แสดง 500 รายการล่าสุด ไม่เก็บเนื้อหาข้อมูลส่วนตัว)" />
      {list.error && <ErrorBox message={list.error} />}
      <div role="group" aria-label="กรองตามการกระทำ" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="tab" aria-pressed={f === 'all'} onClick={() => setF('all')}>ทั้งหมด</button>
        {Object.entries(LABEL).map(([k, v]) => (
          <button key={k} type="button" className="tab" aria-pressed={f === k} onClick={() => setF(k)}>{v}</button>
        ))}
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
                <span>
                  {e.target && e.action !== 'export_csv' && <Link className="mono" to={`/candidate/${e.target}`} style={{ marginRight: 10 }}>{e.target}</Link>}
                  {describe(e)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
