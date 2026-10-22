import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStats } from '../stats';
import { ErrorBox, Loading, PageHead } from '../ui';

type Sort = 'unread' | 'total' | 'name';

/** เลือกตำแหน่งเพื่อดูรายชื่อผู้สมัคร: การ์ดต่อตำแหน่งพร้อมสถิติ (รองรับตำแหน่งจำนวนมากด้วยการค้นหา/กรอง) */
export default function Positions() {
  const { stats, error, loading } = useStats();
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('unread');

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (stats ?? [])
      .filter((s) => !t || s.position_name.toLowerCase().includes(t) || s.job_id.toLowerCase().includes(t))
      .filter((s) => !onlyUnread || s.unread > 0)
      .filter((s) => !onlyOpen || s.is_active)
      .sort((a, b) => sort === 'name' ? a.position_name.localeCompare(b.position_name, 'th') : sort === 'total' ? b.total - a.total || b.unread - a.unread : b.unread - a.unread || b.total - a.total);
  }, [stats, q, onlyUnread, onlyOpen, sort]);

  return (
    <main className="page">
      <PageHead title="ผู้สมัครรายตำแหน่ง" sub="เลือกตำแหน่งเพื่อดูรายชื่อผู้สมัคร เรียงตามคะแนน กรอง และส่งออกได้" />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="pq" className="muted" style={{ fontSize: 13.5 }}>ค้นหาตำแหน่ง</label>
          <input id="pq" className="input" type="search" style={{ height: 44, width: 260 }} placeholder="ชื่อตำแหน่งหรือรหัส" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ps" className="muted" style={{ fontSize: 13.5 }}>เรียงตาม</label>
          <select id="ps" className="select" style={{ height: 44 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="unread">ยังไม่อ่านมากสุด</option>
            <option value="total">ผู้สมัครมากสุด</option>
            <option value="name">ชื่อตำแหน่ง</option>
          </select>
        </div>
        <button type="button" className="tab" aria-pressed={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>เฉพาะที่มียังไม่อ่าน</button>
        <button type="button" className="tab" aria-pressed={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>เฉพาะที่เปิดรับ</button>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && !stats && <Loading />}
      {stats && shown.length === 0 && <div className="empty">ไม่พบตำแหน่งตามเงื่อนไขที่เลือก</div>}

      <div className="poscards">
        {shown.map((s) => {
          return (
            <Link key={s.job_id} className="poscard" to={`/positions/${s.job_id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <h3>{s.position_name}</h3>
                  <span className="mono muted" style={{ fontSize: 12.5 }}>{s.job_id}</span>
                </div>
                <span className={`pill ${s.is_active ? 'pass' : 'pending'}`}>{s.is_active ? 'เปิดรับ' : 'ปิดรับ'}</span>
              </div>
              <div className="nums">
                <div><b>{s.total}</b><span>ผู้สมัคร</span></div>
                <div><b style={{ color: 'var(--accent)' }}>{s.passed}</b><span>ผ่านเกณฑ์</span></div>
                <div><b>{s.avg_score ?? '—'}</b><span>คะแนนเฉลี่ย</span></div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minHeight: 26 }}>
                {s.unread > 0
                  ? <span className="unreadtag"><span className="udot" style={{ background: 'currentColor' }} /> ยังไม่อ่าน {s.unread}</span>
                  : <span className="muted" style={{ fontSize: 13.5 }}>อ่านครบแล้ว</span>}
                {s.starred > 0 && <span className="chip">★ {s.starred}</span>}
                {s.pending + s.failed > 0 && <span className="chip">รอ/ไม่สำเร็จ {s.pending + s.failed}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
