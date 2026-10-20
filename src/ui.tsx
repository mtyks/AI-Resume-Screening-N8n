import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <span className="mark" style={{ width: size, height: size, borderRadius: size * 0.27, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size * 0.57} height={size * 0.57} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/** เมนูบนสำหรับฝั่ง HR / Admin — เมนูที่เห็นขึ้นกับบทบาท */
export function HrLayout() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const isAdmin = session?.role === 'Admin';
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : undefined);
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand"><Mark /> Resume Screening</span>
          <nav className="nav" aria-label="เมนูหลัก">
            <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
            <NavLink to="/jobs" className={link}>ตำแหน่งงาน</NavLink>
            {isAdmin && <NavLink to="/logs" className={link}>สถานะระบบ / Log</NavLink>}
            {isAdmin && <NavLink to="/admin" className={link}>ผู้ใช้และตั้งค่า</NavLink>}
          </nav>
          <div className="userbox">
            <span className="avatar" aria-hidden="true">{session?.role === 'Admin' ? 'AD' : 'HR'}</span>
            <div>
              <div>{session?.email}</div>
              <button type="button" onClick={() => { signOut(); nav('/login'); }}>ออกจากระบบ</button>
            </div>
          </div>
        </div>
      </header>
      <Outlet />
    </>
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
