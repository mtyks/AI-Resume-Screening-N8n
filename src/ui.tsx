import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

/** โลโก้: กระดาษ Resume กับแถบไฮไลต์สีเหลือง */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <span className="mark" style={{ width: size, height: size, borderRadius: size * 0.3, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: `0 0 ${size}px` }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="10" width="14" height="5" rx="1.5" fill="#ffd23f" />
        <path d="M6 4h8M6 8h12M6 13h9M6 18h12" stroke="#131b4d" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const ic = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const IconDash = () => <svg {...ic}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>;
const IconJobs = () => <svg {...ic}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></svg>;
const IconLog = () => <svg {...ic}><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
const IconUsers = () => <svg {...ic}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.2 2.5 3.5 5.2" /></svg>;

/** โครงหน้าฝั่ง HR / Admin: เมนูด้านข้าง เมนูที่เห็นขึ้นกับบทบาท */
export function HrLayout() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const isAdmin = session?.role === 'Admin';
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);
  return (
    <div className="shell">
      <aside className="side">
        <span className="brand"><Mark size={34} /> Resume Screening</span>
        <nav className="nav" aria-label="เมนูหลัก">
          <NavLink to="/dashboard" className={link}><IconDash /> ผลการจับคู่</NavLink>
          <NavLink to="/jobs" className={link}><IconJobs /> ตำแหน่งงาน</NavLink>
          {isAdmin && <NavLink to="/logs" className={link}><IconLog /> สถานะระบบ</NavLink>}
          {isAdmin && <NavLink to="/admin" className={link}><IconUsers /> ผู้ใช้และตั้งค่า</NavLink>}
        </nav>
        <div className="userbox">
          <span className="avatar" aria-hidden="true">{isAdmin ? 'AD' : 'HR'}</span>
          <div className="who">
            <div>{session?.email}</div>
            <button type="button" onClick={() => { signOut(); nav('/login'); }}>ออกจากระบบ</button>
          </div>
        </div>
      </aside>
      <div className="main"><Outlet /></div>
    </div>
  );
}

export function Loading({ text = 'กำลังโหลด…' }: { text?: string }) {
  return <div className="empty" role="status">{text}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="alert err" role="alert">{message}</div>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="muted" style={{ margin: '4px 0 0', fontSize: 15 }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/** วงแหวนคะแนน 0–100 */
export function ScoreRing({ value, color, size = 60, stroke = 6 }: { value: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="ring" style={{ width: size, height: size, ['--len' as string]: len }} role="img" aria-label={`คะแนน ${v.toFixed(1)} จาก 100`}>
      <svg width={size} height={size}>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="val" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={color} style={{ strokeDasharray: `${(len * v) / 100} ${len}` }} />
      </svg>
      <span className="num" style={{ fontSize: size * 0.3 }}>{Math.round(v)}</span>
    </span>
  );
}

/** ภาพประกอบหน้าแรก: Resume ที่ถูกไฮไลต์ทักษะ พร้อมคะแนนที่ระบบให้ */
export function ResumeArt() {
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: '100%', maxWidth: 400, margin: '0 auto' }}>
      <div style={{ background: '#fff', color: '#141a3c', borderRadius: 18, padding: '26px 26px 30px', transform: 'rotate(-2.5deg)', boxShadow: '0 30px 60px -20px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#e8ebff' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 11, width: '55%', background: '#141a3c', borderRadius: 6 }} />
            <div style={{ height: 8, width: '35%', background: '#c9cfe9', borderRadius: 6, marginTop: 8 }} />
          </div>
        </div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {[['100%', false], ['86%', true], ['94%', false], ['72%', true], ['90%', false], ['60%', true]].map(([w, hl], i) => (
            <div key={i} style={{ position: 'relative', height: 9, width: w as string }}>
              {hl && <span style={{ position: 'absolute', inset: '-4px -6px', background: '#ffd23f', borderRadius: 4, opacity: .9 }} />}
              <span style={{ position: 'absolute', inset: 0, background: '#aeb6d9', borderRadius: 5 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', right: -6, bottom: -26, background: '#fff', borderRadius: 20, padding: '12px 18px 12px 12px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 20px 40px -14px rgba(0,0,0,.55)', color: '#141a3c' }}>
        <ScoreRing value={86} color="#0f9d6b" size={58} />
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15 }}>ตรงกับตำแหน่ง</div>
          <div style={{ fontSize: 12.5, color: '#5a6385' }}>ทักษะหลักครบ</div>
        </div>
      </div>
    </div>
  );
}
