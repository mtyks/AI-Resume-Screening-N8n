import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PersonApplication } from '../api';
import { KIND_LABEL, STATUS_LABEL, fmtShort, groupPeople, itemNote, useAsync } from '../lib';
import { useStats } from '../stats';
import { ErrorBox, Loading, PageHead, Pager } from '../ui';

type Sort = 'unread' | 'total' | 'name';
const PAGE_SIZE = 12;

/** เลือกตำแหน่งเพื่อดูรายชื่อผู้สมัคร: การ์ดต่อตำแหน่งพร้อมสถิติ (รองรับตำแหน่งจำนวนมากด้วยการค้นหา/กรอง) */
export default function Positions() {
  const { stats, error, loading } = useStats();
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sort, setSort] = useState<Sort>('unread');
  const [page, setPage] = useState(1);
  // เปลี่ยนตัวกรอง/คำค้น/การเรียง → กลับไปหน้า 1
  useEffect(() => { setPage(1); }, [q, onlyUnread, onlyOpen, sort]);

  // ค้นหาผู้สมัครข้ามทุกตำแหน่ง (รอผู้ใช้หยุดพิมพ์ 0.3 วินาทีก่อนค้นหา)
  const [pq, setPq] = useState('');
  const [pqd, setPqd] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setPqd(pq.trim()), 300);
    return () => clearTimeout(id);
  }, [pq]);
  const searching = pqd.length >= 2;
  const found = useAsync(() => (searching ? api.searchApplicants(pqd) : Promise.resolve([])), [pqd]);
  const people = useMemo(() => groupPeople(found.data ?? []), [found.data]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (stats ?? [])
      .filter((s) => !t || s.position_name.toLowerCase().includes(t) || s.job_id.toLowerCase().includes(t))
      .filter((s) => !onlyUnread || s.unread > 0)
      .filter((s) => !onlyOpen || s.is_active)
      .sort((a, b) => sort === 'name' ? a.position_name.localeCompare(b.position_name, 'th') : sort === 'total' ? b.total - a.total || b.unread - a.unread : b.unread - a.unread || b.total - a.total);
  }, [stats, q, onlyUnread, onlyOpen, sort]);

  const lastPage = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const cur = Math.min(page, lastPage);
  const pageRows = shown.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <main className="page">
      <PageHead title="ผู้สมัครรายตำแหน่ง" sub="ค้นหาผู้สมัครจากชื่อ อีเมล หรือเบอร์โทร เพื่อดูว่าสมัครตำแหน่งใดบ้างและผลเป็นอย่างไร หรือเลือกตำแหน่งเพื่อดูรายชื่อผู้สมัคร" />

      <div className="field" style={{ marginBottom: 18 }}>
        <label htmlFor="ppl" style={{ fontSize: 14.5, fontWeight: 600 }}>ค้นหาผู้สมัคร</label>
        <input id="ppl" className="input" type="search" style={{ height: 48, maxWidth: 560 }} placeholder="พิมพ์ชื่อ อีเมล เบอร์โทร หรือรหัสผู้สมัคร (อย่างน้อย 2 ตัวอักษร)" value={pq} onChange={(e) => setPq(e.target.value)} autoComplete="off" />
      </div>

      {pq.trim().length > 0 && pq.trim().length < 2 && <div className="muted" style={{ fontSize: 14, marginBottom: 14 }}>พิมพ์อย่างน้อย 2 ตัวอักษร</div>}
      {searching && (
        <section aria-label="ผลการค้นหาผู้สมัคร" style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px' }}>
            ผลการค้นหาผู้สมัคร{found.data ? ` (${people.length} คน)` : ''}
          </h2>
          {found.error && <ErrorBox message={found.error} />}
          {found.loading && !found.data && <Loading />}
          {found.data && people.length === 0 && !found.loading && <div className="empty">ไม่พบผู้สมัครที่ตรงกับ “{pqd}”</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: found.loading && found.data ? 0.6 : 1 }}>
            {people.map((p) => (
              <article key={p.key} className="personcard">
                <header style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 600, overflowWrap: 'anywhere' }}>{p.name}</h3>
                    <div className="muted" style={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{p.email} · {p.phone}</div>
                  </div>
                  <span className="chip">สมัคร {p.applications.length} ตำแหน่ง</span>
                </header>
                <ul className="applist">
                  {p.applications.map((a: PersonApplication) => {
                    const c = a.candidate;
                    const note = itemNote({ candidate: c, score: a.score, gate: a.gate, kind: a.kind }, a.threshold ?? 0);
                    return (
                      <li key={c.candidate_id}>
                        <Link className="approw" to={`/candidate/${c.candidate_id}`}>
                          <span className="apppos">
                            <b>{c.applied_position}</b>
                            <span className="muted" style={{ fontSize: 12.5 }}>สมัครเมื่อ {fmtShort(c.received_at)} · สถานะ {STATUS_LABEL[c.application_status] ?? c.application_status}</span>
                          </span>
                          <span className="appscore">
                            {a.score !== null ? <><b>{a.score.toFixed(1)}</b> / 100{a.threshold !== null && <span className="muted"> (เกณฑ์ {a.threshold})</span>}</> : <span className="muted">ยังไม่มีคะแนน</span>}
                          </span>
                          <span className="appkind">
                            <span className={`pill ${a.kind}`}>{a.kind === 'pending' && a.score !== null ? 'กำลังสแกนซ้ำ' : KIND_LABEL[a.kind]}</span>
                            {note && <span className="muted" style={{ fontSize: 12.5 }}>{note}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

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
        {pageRows.map((s) => {
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
      <Pager page={cur} size={PAGE_SIZE} total={shown.length} unit="ตำแหน่ง" onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </main>
  );
}
