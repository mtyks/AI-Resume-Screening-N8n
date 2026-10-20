import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Role, SystemConfig } from '../api';
import { useAuth } from '../auth';
import { fmtShort, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead } from '../ui';

const PERMS: [string, boolean, boolean][] = [
  ['ดู Dashboard / ผู้สมัคร', true, true],
  ['ตั้งค่าตำแหน่งงาน', true, true],
  ['ดู Log ระบบ', false, true],
  ['จัดการผู้ใช้และตั้งค่าระบบ', false, true]
];

export default function Admin() {
  const { session } = useAuth();
  const users = useAsync(() => api.listUsers(), []);
  const config = useAsync(() => api.getConfig(), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('HR');
  const [uMsg, setUMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cfg, setCfg] = useState<SystemConfig | null>(null);
  const [cMsg, setCMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { if (config.data) setCfg(config.data); }, [config.data]);

  async function add() {
    setUMsg(null);
    try {
      await api.addUser(email, role);
      setEmail('');
      setUMsg({ ok: true, text: 'เพิ่มผู้ใช้แล้ว' });
      users.reload();
    } catch (e) {
      setUMsg({ ok: false, text: e instanceof Error ? e.message : 'เพิ่มไม่สำเร็จ' });
    }
  }

  async function remove(mail: string) {
    setUMsg(null);
    try {
      await api.removeUser(mail);
      users.reload();
    } catch (e) {
      setUMsg({ ok: false, text: e instanceof Error ? e.message : 'ลบไม่สำเร็จ' });
    }
  }

  async function saveCfg() {
    if (!cfg) return;
    setCMsg(null);
    try {
      await api.saveConfig(cfg);
      setCMsg({ ok: true, text: 'บันทึกการตั้งค่าแล้ว' });
    } catch (e) {
      setCMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    }
  }

  return (
    <main className="page">
      <PageHead title="ผู้ใช้งานและการตั้งค่าระบบ" sub="เฉพาะผู้ดูแลระบบ (Admin) เห็นหน้านี้" />
      {(users.error || config.error) && <ErrorBox message={users.error ?? config.error ?? ''} />}

      <div className="split">
        <section className="card" style={{ flex: '1.5 1 560px', minWidth: 0, padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>ผู้ที่ได้รับสิทธิ์เข้าใช้งาน</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>อีเมลที่อยู่ในรายการนี้เท่านั้นที่เข้าสู่ระบบได้ (ตาราง authorized_users)</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void add(); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '2 1 220px' }}>
              <label htmlFor="nu_email" style={{ fontSize: 14.5 }}>อีเมล</label>
              <input id="nu_email" className="input" type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label htmlFor="nu_role" style={{ fontSize: 14.5 }}>บทบาท</label>
              <select id="nu_role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}><option>HR</option><option>Admin</option></select>
            </div>
            <button className="btn primary" type="submit">เพิ่มผู้ใช้</button>
          </form>
          {uMsg && <div role="status" className={`alert ${uMsg.ok ? 'ok' : 'err'}`}>{uMsg.text}</div>}

          {users.loading && !users.data ? <Loading /> : (
            <div className="table-wrap">
              <div className="inner" style={{ minWidth: 480 }}>
                <div className="trow head" style={{ gridTemplateColumns: 'minmax(0,2fr) 110px 150px 90px' }}><span>อีเมล</span><span>บทบาท</span><span>เพิ่มเมื่อ</span><span /></div>
                {users.data?.length === 0 && <div className="empty" style={{ border: 'none' }}>ยังไม่มีผู้ได้รับสิทธิ์ — เพิ่มอีเมลแรกด้านบน</div>}
                {users.data?.map((u) => (
                  <div className="trow" style={{ gridTemplateColumns: 'minmax(0,2fr) 110px 150px 90px' }} key={u.email}>
                    <span style={{ overflowWrap: 'anywhere' }}>{u.email}{u.email === session?.email && <span className="muted"> (คุณ)</span>}</span>
                    <span><span className={`pill ${u.role === 'Admin' ? '' : 'pass'}`} style={u.role === 'Admin' ? { background: 'var(--nav)', color: '#fff', fontSize: 12.5, padding: '3px 11px' } : { fontSize: 12.5, padding: '3px 11px' }}>{u.role}</span></span>
                    <span className="muted">{fmtShort(u.added_at)}</span>
                    <button type="button" className="btn small" disabled={u.email === session?.email} aria-label={`ลบ ${u.email}`} onClick={() => void remove(u.email)}>ลบ</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>สิทธิ์ตามบทบาท</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) 60px 60px', gap: '10px 8px', fontSize: 14.5, alignItems: 'center' }}>
              <span /><b style={{ textAlign: 'center' }}>HR</b><b style={{ textAlign: 'center' }}>Admin</b>
              {PERMS.map(([n, hr, ad]) => (
                <div key={n} style={{ display: 'contents' }}>
                  <span>{n}</span>
                  <span style={{ textAlign: 'center' }} aria-label={hr ? 'ทำได้' : 'ทำไม่ได้'}>{hr ? '✓' : '—'}</span>
                  <span style={{ textAlign: 'center' }} aria-label={ad ? 'ทำได้' : 'ทำไม่ได้'}>{ad ? '✓' : '—'}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>หน้า Log และหน้านี้เห็นได้เฉพาะ Admin ระบบบังคับตามตารางนี้ในหน้าเว็บ</p>
          </section>

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>ตั้งค่าระบบ</h2>
            {cfg && (
              <>
                <div className="field">
                  <label htmlFor="cfg_ai">ผู้ให้บริการ AI <span className="mono muted" style={{ fontSize: 12.5 }}>AI_PROVIDER</span></label>
                  <select id="cfg_ai" className="select" style={{ height: 44 }} value={cfg.AI_PROVIDER} onChange={(e) => setCfg({ ...cfg, AI_PROVIDER: e.target.value })}><option value="gemini">Gemini — คีย์หลัก</option><option value="gemini_backup">Gemini — คีย์สำรอง (ใช้เมื่อคีย์หลักโควตาหมด)</option></select>
                  <span className="hint">เปลี่ยนเมื่อคีย์หลักโควตาหมด งานที่ประมวลผลครั้งต่อไปจะใช้ตัวที่เลือกทันที</span>
                </div>
                <div className="alert warn" style={{ fontSize: 13.5 }}>รหัสลับ (API key, webhook secret) ไม่แสดงและไม่แก้ในหน้านี้ ต้องตั้งผ่านฝั่งเซิร์ฟเวอร์เท่านั้น</div>
                {cMsg && <div role="status" className={`alert ${cMsg.ok ? 'ok' : 'err'}`}>{cMsg.text}</div>}
                <button className="btn primary" type="button" onClick={() => void saveCfg()}>บันทึกการตั้งค่า</button>
              </>
            )}
          </section>

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>โหมดทดลอง</h2>
            <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>ข้อมูลทั้งหมดเก็บในเบราว์เซอร์นี้ ยังไม่เชื่อมฐานข้อมูลจริง กดเพื่อคืนข้อมูลตัวอย่างตั้งต้น</p>
            <button className="btn" type="button" onClick={async () => { await api.resetDemoData(); window.location.reload(); }}>รีเซ็ตข้อมูลตัวอย่าง</button>
          </section>
        </div>
      </div>
    </main>
  );
}
