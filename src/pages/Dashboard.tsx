import { Link } from 'react-router-dom';
import { useStats } from '../stats';
import { ErrorBox, Loading, PageHead } from '../ui';

/**
 * ภาพรวมทั้งระบบ: ยอดรวม (รวมจำนวนยังไม่อ่าน) และจำนวนผู้สมัครแยกตามตำแหน่ง
 * รายชื่อผู้สมัครอยู่ที่หน้า "ผู้สมัครรายตำแหน่ง" (แบ่งหน้า รองรับจำนวนมาก)
 */
export default function Dashboard() {
  const { stats, error, loading } = useStats();
  const sum = (f: (s: NonNullable<typeof stats>[number]) => number) => (stats ?? []).reduce((a, s) => a + f(s), 0);
  const top = [...(stats ?? [])].filter((s) => s.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  const max = Math.max(1, ...top.map((s) => s.total));

  return (
    <main className="page">
      <PageHead title="ภาพรวม" sub="สรุปผู้สมัครทั้งหมดและสิ่งที่ต้องทำ">
        <Link className="btn primary" to="/positions" style={{ textDecoration: 'none' }}>ดูผู้สมัครรายตำแหน่ง →</Link>
      </PageHead>

      {error && <ErrorBox message={error} />}
      {loading && !stats && <Loading />}

      {stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
            <div className="stat"><div className="k">ผู้สมัครทั้งหมด</div><div className="v">{sum((s) => s.total)}</div></div>
            <div className="stat"><div className="k">ยังไม่อ่าน</div><div className="v" style={{ color: 'var(--brand)' }}>{sum((s) => s.unread)}</div></div>
            <div className="stat"><div className="k">ผ่านเกณฑ์</div><div className="v" style={{ color: 'var(--accent)' }}>{sum((s) => s.passed)}</div></div>
            <div className="stat"><div className="k">ติดดาว (Shortlist)</div><div className="v">{sum((s) => s.starred)}</div></div>
            <div className="stat"><div className="k">รอประมวลผล / ไม่สำเร็จ</div><div className="v">{sum((s) => s.pending + s.failed)}</div></div>
          </div>

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700 }}>ผู้สมัครแยกตามตำแหน่ง</h2>
              <span className="muted" style={{ fontSize: 13.5 }}>แถบเข้ม = ยังไม่อ่าน · แถบอ่อน = อ่านแล้ว</span>
            </div>
            {top.length === 0 && <div className="empty">ยังไม่มีผู้สมัคร</div>}
            {top.map((s) => (
              <Link key={s.job_id} to={`/positions/${s.job_id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 220px) minmax(0, 1fr) 150px', alignItems: 'center', gap: '6px 16px', textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{s.position_name}</span>
                <span style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--neutral-bg)' }} role="img" aria-label={`${s.total} คน ยังไม่อ่าน ${s.unread} คน`}>
                  <span style={{ width: `${(s.unread / max) * 100}%`, background: 'var(--brand)' }} />
                  <span style={{ width: `${((s.total - s.unread) / max) * 100}%`, background: '#b9ddc9' }} />
                </span>
                <span className="muted" style={{ fontSize: 13.5, textAlign: 'right' }}>{s.total} คน · ผ่านเกณฑ์ {s.passed}</span>
              </Link>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
