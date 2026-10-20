import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { LogStatus } from '../api';
import { fmtStamp, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

const COLS = '190px 120px 170px minmax(0,1fr)';

export default function Logs() {
  const logs = useAsync(() => api.listLogs(), []);
  const failed = useAsync(() => api.listFailedCandidates(), []);
  const [f, setF] = useState<'all' | LogStatus>('all');
  const [q, setQ] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);

  const all = logs.data ?? [];
  const ok = all.filter((l) => l.status === 'Success').length;
  const err = all.filter((l) => l.status === 'Error').length;
  const text = q.trim().toLowerCase();
  const shown = all.filter((l) => (f === 'all' || l.status === f) && (!text || (l.candidate_id ?? '').toLowerCase().includes(text)));

  async function retry(id: string) {
    setRetrying(id);
    try { await api.retryCandidate(id); } catch (e) { window.alert(e instanceof Error ? e.message : 'สั่งสแกนซ้ำไม่สำเร็จ'); }
    setRetrying(null);
    logs.reload();
    failed.reload();
  }

  return (
    <main className="page">
      <PageHead title="สถานะระบบอัตโนมัติ" sub="บันทึกการทำงานของ workflow ทุกครั้ง เรียงจากล่าสุด" />
      {(logs.error || failed.error) && <ErrorBox message={logs.error ?? failed.error ?? ''} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="stat"><div className="k">สำเร็จ</div><div className="v" style={{ color: 'var(--accent)' }}>{ok}</div></div>
        <div className="stat"><div className="k">ข้อผิดพลาด</div><div className="v" style={{ color: 'var(--danger-ink)' }}>{err}</div></div>
        <div className="stat"><div className="k">ผู้สมัครที่ประมวลผลไม่สำเร็จ</div><div className="v">{failed.data?.length ?? '—'}</div></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="กรองตามสถานะ" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['all', 'Success', 'Error'] as const).map((k) => (
            <button key={k} type="button" className="tab" aria-pressed={f === k} onClick={() => setF(k)}>{k === 'all' ? 'ทุกสถานะ' : k}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="lq" className="muted" style={{ fontSize: 13.5 }}>ค้นหารหัสผู้สมัคร</label>
          <input id="lq" className="input" type="search" style={{ height: 44, width: 240 }} placeholder="เช่น C1968415639" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {logs.loading && !logs.data ? <Loading /> : (
        <div className="table-wrap">
          <div className="inner">
            <div className="trow head" style={{ gridTemplateColumns: COLS }}><span>เวลา</span><span>สถานะ</span><span>ผู้สมัคร</span><span>รายละเอียด</span></div>
            {shown.length === 0 && <div className="empty" style={{ border: 'none' }}>ไม่พบ log ตามเงื่อนไข</div>}
            {shown.map((l) => (
              <div className="trow" style={{ gridTemplateColumns: COLS }} key={l.log_id}>
                <span className="mono muted" style={{ fontSize: 13.5 }}>{fmtStamp(l.timestamp)}</span>
                <span><span className={`pill ${l.status === 'Success' ? 'pass' : 'gate'}`} style={{ fontSize: 12.5, padding: '3px 11px' }}>{l.status}</span></span>
                <span className="mono" style={{ fontSize: 13.5 }}>{l.candidate_id ? <Link to={`/candidate/${l.candidate_id}`}>{l.candidate_id}</Link> : '—'}</span>
                <span>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="card" style={{ borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>ผู้สมัครที่ระบบประมวลผลไม่สำเร็จ</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>ใบสมัครเหล่านี้ได้รับแล้ว แต่ยังไม่มีคะแนน ลองประมวลผลใหม่ได้หลังแก้สาเหตุ</p>
        </div>
        {failed.data?.length === 0 && <span className="muted" style={{ fontSize: 14 }}>ไม่มีรายการค้าง</span>}
        {failed.data?.map((c) => (
          <div key={c.candidate_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px', background: '#fbf3f2', borderRadius: 10, padding: '14px 16px' }}>
            <Link to={`/candidate/${c.candidate_id}`} className="mono" style={{ fontSize: 14 }}>{c.candidate_id}</Link>
            <span style={{ fontSize: 14.5, flex: '1 1 280px' }}>{c.full_name} · {c.processing_error}</span>
            <button className="btn small" type="button" disabled={retrying === c.candidate_id} onClick={() => void retry(c.candidate_id)}>{retrying === c.candidate_id ? 'กำลังสั่ง…' : 'ประมวลผลใหม่'}</button>
          </div>
        ))}
      </section>

      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>ฐานข้อมูลจริงบันทึกสถานะเพียง Success และ Error จึงไม่มีตัวกรอง “Retry” หากต้องการแสดงการลองใหม่ ต้องเพิ่มการเขียน log สถานะนี้ใน workflow</p>
    </main>
  );
}
