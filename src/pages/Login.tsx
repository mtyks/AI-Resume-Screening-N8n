import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { isReal } from '../api';
import { Mark, ResumeArt } from '../ui';

export default function Login() {
  const { session, signIn, signInGoogle } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;
  const from = (loc.state as { from?: string } | null)?.from ?? '/dashboard';

  async function go(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await signIn(e, p);
      nav(from, { replace: true });
    } catch {
      setError('อีเมลนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน หรือรหัสผ่านไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มอีเมลของคุณ');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      if (isReal) await signInGoogle(); // เบราว์เซอร์จะถูกพาไปหน้า Google แล้วกลับมาที่หน้านี้
      else await go('admin@example.com', 'google');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
      setBusy(false);
    }
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    void go(email, password);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: '100vh' }}>
      <main style={{ flex: '1 1 440px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'clamp(24px, 5vw, 56px) clamp(16px, 4vw, 40px)' }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--display)', fontSize: 18, fontWeight: 600 }}><span style={{ background: 'var(--nav)', borderRadius: 10, display: 'inline-flex' }}><Mark size={38} /></span> Resume Screening</div>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 8px' }}>เข้าสู่ระบบ</h1>
            <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>สำหรับเจ้าหน้าที่ HR และผู้ดูแลระบบที่ได้รับสิทธิ์เท่านั้น</p>
          </div>

          {error && <div role="alert" className="alert err">{error}</div>}
          {isReal && window.location.protocol === 'file:' && (
            <div role="alert" className="alert warn">เปิดไฟล์จากเครื่องโดยตรงจะล็อกอินด้วย Google ไม่ได้ ต้องเปิดผ่านเว็บที่โฮสต์แล้ว (https) หรือรันด้วย <span className="mono">npm run dev</span></div>
          )}

          {!isReal && <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="field">
              <label htmlFor="le">อีเมล</label>
              <input id="le" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="field">
              <label htmlFor="lp">รหัสผ่าน</label>
              <input id="lp" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn primary" type="submit" disabled={busy} style={{ height: 52, borderRadius: 14, fontSize: 16 }}>{busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
          </form>}

          {!isReal && <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--muted)', fontSize: 14 }}>
            <span style={{ flex: 1, height: 1, background: '#cfd9d3' }} />หรือ<span style={{ flex: 1, height: 1, background: '#cfd9d3' }} />
          </div>}
          <button className="btn" type="button" disabled={busy} onClick={() => void google()} style={{ height: 52, borderRadius: 14, fontSize: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" /><path fill="#FBBC04" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" /></svg>
            เข้าสู่ระบบด้วย Google
          </button>

          {!isReal && <div className="alert warn" style={{ fontSize: 13.5 }}>
            <b>โหมดทดลอง</b> — ยังไม่ได้เชื่อมระบบยืนยันตัวตนจริง ใช้บัญชีตัวอย่างด้านล่าง รหัสผ่านพิมพ์อะไรก็ได้
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn small" onClick={() => void go('admin@example.com', 'demo')}>เข้าเป็น Admin</button>
              <button type="button" className="btn small" onClick={() => void go('hr@example.com', 'demo')}>เข้าเป็น HR</button>
            </div>
          </div>}
          <Link to="/" style={{ fontSize: 14 }}>← ไปหน้าฟอร์มสมัครงาน</Link>
        </div>
      </main>

      <aside className="hero" style={{ flex: '1 1 440px', padding: 'clamp(28px, 5vw, 56px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
        <div style={{ maxWidth: 460 }}>
          <h2 style={{ fontSize: 'clamp(28px, 3vw, 38px)', lineHeight: 1.3, fontWeight: 700, margin: '0 0 14px', color: '#fff' }}>ดูผู้สมัครที่ตรงกับตำแหน่ง เรียงตามคะแนน พร้อมเหตุผล</h2>
          <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.75, color: 'var(--nav-muted)' }}>ตั้งเกณฑ์ตำแหน่ง ตรวจผลที่ AI ประเมิน และสั่งสแกนซ้ำเมื่อใบสมัครค้างได้ในที่เดียว</p>
        </div>
        <ResumeArt />
      </aside>
    </div>
  );
}
