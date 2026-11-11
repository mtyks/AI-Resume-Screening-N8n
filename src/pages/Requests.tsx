import { useState } from 'react';
import { api } from '../api';
import type { DataRequest } from '../api';
import { fmtStamp, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

const ST: Record<DataRequest['status'], string> = { open: 'รอดำเนินการ', done: 'ลบแล้ว', rejected: 'ปฏิเสธ' };

/** HR/Admin: คำขอลบข้อมูลตาม PDPA จากผู้สมัคร */
export default function Requests() {
  const list = useAsync(() => api.listDataRequests(), []);
  const [only, setOnly] = useState(true);
  const [confirm, setConfirm] = useState<{ id: number; ack: boolean; busy: boolean } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const rows = (list.data ?? []).filter((r) => !only || r.status === 'open');

  async function fulfill(r: DataRequest) {
    setConfirm((c) => (c ? { ...c, busy: true } : c));
    try {
      const n = await api.fulfillDataRequest(r.id);
      setNotice({ ok: true, text: `ลบข้อมูลของ ${r.email} แล้ว ${n} ใบสมัคร (รวมไฟล์ Resume)` });
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'ลบไม่สำเร็จ' }); }
    setConfirm(null);
    list.reload();
  }
  async function reject(r: DataRequest) {
    if (!window.confirm(`ปฏิเสธคำขอของ ${r.email} ? (ข้อมูลจะไม่ถูกลบ)`)) return;
    try { await api.rejectDataRequest(r.id); } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' }); }
    list.reload();
  }

  return (
    <main className="page">
      <PageHead title="คำขอลบข้อมูล (PDPA)" sub="ผู้สมัครส่งคำขอได้จากลิงก์ท้ายหน้าสมัครงาน การลบจะลบทุกใบสมัครของอีเมลนั้น รวมไฟล์ Resume และผลประเมิน และถาวร">
        <button type="button" className="tab" aria-pressed={only} onClick={() => setOnly((v) => !v)}>เฉพาะที่รอดำเนินการ</button>
      </PageHead>
      {list.error && <ErrorBox message={list.error} />}
      {list.loading && !list.data && <Loading />}
      {notice && <div role="status" className={`alert ${notice.ok ? 'ok' : 'err'}`}>{notice.text}</div>}
      {list.data && rows.length === 0 && <div className="empty">{only ? 'ไม่มีคำขอที่รอดำเนินการ' : 'ยังไม่มีคำขอ'}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((r) => (
          <article key={r.id} className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ overflowWrap: 'anywhere' }}>{r.email}</b>{r.full_name && <span className="muted"> · {r.full_name}</span>}
                <div className="muted" style={{ fontSize: 13.5 }}>ส่งเมื่อ {fmtStamp(r.created_at)}</div>
              </div>
              <span className={`pill ${r.status === 'open' ? 'pending' : r.status === 'done' ? 'pass' : 'gate'}`}>{ST[r.status]}</span>
            </div>
            {r.note && <div style={{ fontSize: 14.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{r.note}”</div>}
            {r.status === 'open' && (
              <>
                <div className="muted" style={{ fontSize: 14 }}>{r.matches === 0 ? 'ไม่พบใบสมัครที่ใช้อีเมลนี้ในระบบ (อาจถูกลบไปแล้ว หรือสะกดต่างกัน)' : `พบ ${r.matches ?? '…'} ใบสมัครที่ใช้อีเมลนี้`}</div>
                {confirm?.id === r.id ? (
                  <div className="confirmbox" role="alertdialog" aria-label="ยืนยันการลบ">
                    <b style={{ color: 'var(--danger-ink)' }}>ลบทุกใบสมัครของ {r.email} ถาวร กู้คืนไม่ได้</b>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14.5 }}><input className="chk" type="checkbox" checked={confirm.ack} onChange={(e) => setConfirm({ ...confirm, ack: e.target.checked })} /> ฉันยืนยันว่าตรวจสอบตัวตนผู้ขอแล้ว (เช่น ตอบกลับทางอีเมลนี้)</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" className="btn danger" disabled={!confirm.ack || confirm.busy} onClick={() => void fulfill(r)}>{confirm.busy ? 'กำลังลบ…' : 'ลบข้อมูล'}</button>
                      <button type="button" className="btn" disabled={confirm.busy} onClick={() => setConfirm(null)}>ยกเลิก</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn small danger" onClick={() => setConfirm({ id: r.id, ack: false, busy: false })}>ลบข้อมูลของอีเมลนี้</button>
                    <button type="button" className="btn small" onClick={() => void reject(r)}>ปฏิเสธคำขอ</button>
                  </div>
                )}
              </>
            )}
            {r.status !== 'open' && r.handled_at && <div className="muted" style={{ fontSize: 13.5 }}>ดำเนินการเมื่อ {fmtStamp(r.handled_at)} โดย {r.handled_by ?? '-'}{r.status === 'done' ? ` · ลบ ${r.deleted_count ?? 0} ใบสมัคร` : ''}</div>}
          </article>
        ))}
      </div>
    </main>
  );
}
