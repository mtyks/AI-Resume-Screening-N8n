import { useEffect, useState, type KeyboardEvent } from 'react';
import { api } from '../api';
import type { Job } from '../api';
import { ErrorBox, Loading, PageHead } from '../ui';
import { useAsync } from '../lib';

interface Draft {
  job_id?: string;
  position_name: string;
  must: string[];
  pref: string[];
  tools: string[];
  min: string;
  prefType: string;
  thr: number;
  wm: number;
  wp: number;
  wt: number;
  we: number;
  active: boolean;
  desc: string;
  openAt: string;  // รูปแบบ datetime-local (เวลาท้องถิ่น) ว่าง = เปิดทันที
  closeAt: string; // ว่าง = ไม่กำหนดวันปิด
}

// ISO (UTC) -> ค่าสำหรับ <input type=datetime-local>
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const emptyDraft = (): Draft => ({ position_name: '', must: [], pref: [], tools: [], min: '0', prefType: '', thr: 70, wm: 50, wp: 20, wt: 30, we: 0, active: true, desc: '', openAt: '', closeAt: '' });

// ประสบการณ์ไม่นำมาคิดคะแนนแล้ว: ปรับสัดส่วน 3 หมวดที่เหลือให้รวม 100%
function normW(j: Job): { wm: number; wp: number; wt: number } {
  const t = j.weight_musthave + j.weight_preferred + j.weight_tool || 1;
  const wm = Math.round((j.weight_musthave / t) * 100);
  const wp = Math.round((j.weight_preferred / t) * 100);
  return { wm, wp, wt: 100 - wm - wp };
}

const toDraft = (j: Job): Draft => ({
  job_id: j.job_id,
  position_name: j.position_name,
  must: j.must_have_skills,
  pref: j.preferred_skills,
  tools: j.required_tools,
  min: String(j.min_experience_years),
  prefType: j.preferred_experience_type ?? '',
  thr: j.match_threshold,
  ...normW(j),
  we: 0,
  active: j.is_active,
  desc: j.description ?? '',
  openAt: toLocalInput(j.open_at),
  closeAt: toLocalInput(j.close_at)
});

function TagEditor({ label, hint, items, cls, addLabel, placeholder, onChange }: { label: string; hint: string; items: string[]; cls: 'must' | 'pref' | 'tool'; addLabel: string; placeholder: string; onChange: (v: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const commit = () => {
    const t = text.trim();
    if (t && !items.includes(t)) onChange([...items, t]);
    setText('');
    setAdding(false);
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setText(''); setAdding(false); }
  };
  return (
    <div className="field" style={{ gap: 8 }}>
      <span className="label" style={{ fontWeight: 600 }}>{label} <span className="muted" style={{ fontWeight: 400 }}>{hint}</span></span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {items.map((t) => (
          <span key={t} className={`tag ${cls}`}>{t}<button type="button" aria-label={`ลบ ${t}`} onClick={() => onChange(items.filter((x) => x !== t))}>×</button></span>
        ))}
        {adding ? (
          <input className="input" autoFocus style={{ height: 38, width: 260 }} aria-label={addLabel} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} onBlur={commit} />
        ) : (
          <button type="button" className="btn small" style={{ borderStyle: 'dashed', borderRadius: 18, background: 'transparent' }} onClick={() => setAdding(true)}>+ {addLabel}</button>
        )}
      </div>
    </div>
  );
}

export default function Jobs() {
  const jobs = useAsync(() => api.listJobs(), []);
  const [sel, setSel] = useState<string | 'new'>('');
  const [d, setD] = useState<Draft>(emptyDraft());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sel && jobs.data?.length) { setSel(jobs.data[0].job_id); setD(toDraft(jobs.data[0])); }
  }, [jobs.data, sel]);

  const pick = (j: Job) => { setSel(j.job_id); setD(toDraft(j)); setMsg(null); };
  const startNew = () => { setSel('new'); setD(emptyDraft()); setMsg(null); };
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const sum = d.wm + d.wp + d.wt;
  const sumOk = sum === 100;
  const nameErr = !d.position_name.trim();
  const mustErr = d.must.length === 0;
  const rangeErr = Boolean(d.openAt && d.closeAt && new Date(d.closeAt) <= new Date(d.openAt));
  const canSave = sumOk && !nameErr && !mustErr && !rangeErr && !busy;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api.saveJob({
        job_id: d.job_id,
        position_name: d.position_name.trim(),
        must_have_skills: d.must,
        preferred_skills: d.pref,
        required_tools: d.tools,
        min_experience_years: Number(d.min) || 0,
        preferred_experience_type: d.prefType.trim() || null,
        weight_musthave: d.wm / 100,
        weight_preferred: d.wp / 100,
        weight_tool: d.wt / 100,
        weight_experience: 0,
        match_threshold: d.thr,
        is_active: d.active,
        description: d.desc.trim() || null,
        open_at: fromLocalInput(d.openAt),
        close_at: fromLocalInput(d.closeAt)
      });
      jobs.reload();
      setSel(saved.job_id);
      setD(toDraft(saved));
      setMsg({ ok: true, text: `บันทึกตำแหน่ง ${saved.position_name} (${saved.job_id}) แล้ว` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  }

  const W: [string, keyof Draft, string][] = [['ทักษะที่ต้องมี', 'wm', 'w_must'], ['ทักษะที่ควรมี', 'wp', 'w_pref'], ['เครื่องมือ', 'wt', 'w_tool']];

  return (
    <main className="page">
      <PageHead title="ตั้งค่าตำแหน่งงาน" sub="กำหนดทักษะ ประสบการณ์ น้ำหนักคะแนน และเกณฑ์ผ่านที่ใช้คัดกรองผู้สมัคร" />
      {jobs.error && <ErrorBox message={jobs.error} />}
      {jobs.loading && !jobs.data && <Loading />}

      <div className="split">
        <aside style={{ flex: '1 1 280px', maxWidth: 360, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {jobs.data?.map((j) => (
            <button key={j.job_id} type="button" onClick={() => pick(j)} aria-current={sel === j.job_id}
              style={{ textAlign: 'left', background: '#fff', border: sel === j.job_id ? '2px solid var(--brand)' : '1px solid var(--line)', borderRadius: 12, padding: sel === j.job_id ? '13px 15px' : '14px 16px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 16 }}>{j.position_name}</b>
                <span className={`pill ${j.is_active ? 'pass' : 'pending'}`} style={{ fontSize: 12.5, padding: '3px 10px' }}>{j.is_active ? 'เปิดรับสมัคร' : 'ปิดรับสมัคร'}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}><span className="mono">{j.job_id}</span> · เกณฑ์ผ่าน {j.match_threshold}</div>
            </button>
          ))}
          <button type="button" className="btn" style={{ borderStyle: 'dashed', background: 'transparent', borderRadius: 12 }} onClick={startNew}>+ เพิ่มตำแหน่งใหม่</button>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>รหัสตำแหน่งสร้างอัตโนมัติเมื่อบันทึก และแก้ไขภายหลังไม่ได้</p>
        </aside>

        {sel && (
          <section className="card" style={{ flex: '2.4 1 620px', minWidth: 0, padding: 32, display: 'flex', flexDirection: 'column', gap: 30 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 20 }}>
              <div className="field">
                <label htmlFor="job_id">รหัสตำแหน่ง</label>
                <input id="job_id" className="input mono" disabled value={d.job_id ?? 'สร้างเมื่อบันทึก'} />
              </div>
              <div className="field">
                <label htmlFor="pname">ชื่อตำแหน่ง</label>
                <input id="pname" className="input" value={d.position_name} onChange={(e) => up('position_name', e.target.value)} aria-invalid={nameErr ? 'true' : undefined} />
                {nameErr && <span className="err">กรุณากรอกชื่อตำแหน่ง (ต้องตรงกับที่แสดงในฟอร์มสมัครงาน)</span>}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <TagEditor label="ทักษะที่ต้องมี" hint="(ถ้า AI มั่นใจต่ำกว่า 50 ในข้อใดข้อหนึ่ง จะไม่ผ่าน Gate)" items={d.must} cls="must" addLabel="เพิ่มทักษะ" placeholder="เช่น ใช้ n8n สร้าง Workflow ได้" onChange={(v) => up('must', v)} />
              {mustErr && <span className="err" style={{ marginTop: -14 }}>ต้องมีอย่างน้อย 1 ทักษะที่ต้องมี</span>}
              <TagEditor label="ทักษะที่ควรมี" hint="(ช่วยเพิ่มคะแนน ไม่มีผลกับ Gate)" items={d.pref} cls="pref" addLabel="เพิ่มทักษะ" placeholder="เช่น เคยใช้ Docker" onChange={(v) => up('pref', v)} />
              <TagEditor label="เครื่องมือที่ต้องใช้" hint="(ใช้ชื่อสั้น ๆ)" items={d.tools} cls="tool" addLabel="เพิ่มเครื่องมือ" placeholder="เช่น n8n" onChange={(v) => up('tools', v)} />
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor="min">ประสบการณ์ขั้นต่ำ (ปี) <span className="muted" style={{ fontWeight: 400 }}>ใช้ติดธงให้ HR ไม่คิดคะแนน</span></label>
                <input id="min" className="input" type="number" min="0" step="0.5" value={d.min} onChange={(e) => up('min', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ptype">ประเภทประสบการณ์ที่ต้องการ <span className="muted" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></label>
                <input id="ptype" className="input" placeholder="เช่น งานอัตโนมัติกระบวนการ" value={d.prefType} onChange={(e) => up('prefType', e.target.value)} />
              </div>
            </div>

            <div className="field" style={{ gap: 10 }}>
              <label htmlFor="thr" style={{ fontWeight: 600 }}>เกณฑ์คะแนนผ่าน</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <input id="thr" type="range" min="0" max="100" step="1" value={d.thr} onChange={(e) => up('thr', Number(e.target.value))} style={{ flex: 1, height: 32, accentColor: 'var(--brand)' }} />
                <span className="mono" style={{ fontSize: 24, color: 'var(--brand)', minWidth: 56, textAlign: 'right' }}>{d.thr}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>น้ำหนักคะแนน 3 หมวด</span>
                <span role="status" className="pill" style={{ fontSize: 14, background: sumOk ? 'var(--accent-soft)' : 'var(--danger-bg)', color: sumOk ? 'var(--accent-ink)' : 'var(--danger-ink)' }}>
                  {sumOk ? 'รวม 100% — พร้อมบันทึก' : `รวม ${sum}% — ต้องเท่ากับ 100%`}
                </span>
              </div>
              {W.map(([label, key, id]) => (
                <div key={id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,3fr) 56px', gap: '8px 16px', alignItems: 'center' }}>
                  <label htmlFor={id} style={{ fontSize: 15 }}>{label}</label>
                  <input id={id} type="range" min="0" max="100" step="5" value={d[key] as number} onChange={(e) => up(key, Number(e.target.value) as never)} style={{ height: 32, accentColor: 'var(--brand)' }} />
                  <span className="mono" style={{ textAlign: 'right', fontSize: 16 }}>{d[key] as number}%</span>
                </div>
              ))}
            </div>

            <div className="field">
              <label htmlFor="desc">รายละเอียดตำแหน่ง <span className="muted" style={{ fontWeight: 400 }}>(ผู้สมัครเห็นในฟอร์ม ไม่บังคับ)</span></label>
              <textarea id="desc" className="input" rows={3} style={{ height: 'auto', padding: 12 }} value={d.desc} onChange={(e) => up('desc', e.target.value)} />
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor="openAt">เริ่มรับสมัคร <span className="muted" style={{ fontWeight: 400 }}>(ว่าง = ทันที)</span></label>
                <input id="openAt" className="input" type="datetime-local" value={d.openAt} onChange={(e) => up('openAt', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="closeAt">ปิดรับสมัคร <span className="muted" style={{ fontWeight: 400 }}>(ว่าง = ไม่กำหนด)</span></label>
                <input id="closeAt" className="input" type="datetime-local" value={d.closeAt} onChange={(e) => up('closeAt', e.target.value)} aria-invalid={rangeErr ? 'true' : undefined} />
                {rangeErr && <span className="err">วันปิดต้องอยู่หลังวันเริ่มรับสมัคร</span>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderTop: '1px solid var(--line)', paddingTop: 22 }}>
              <div><div style={{ fontSize: 15, fontWeight: 600 }}>เปิดรับสมัคร</div><div className="muted" style={{ fontSize: 13 }}>ปิดแล้ว หรือนอกช่วงเวลาด้านบน ตำแหน่งจะไม่แสดงในฟอร์มสมัครงาน</div></div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14.5 }}>
                <input type="checkbox" role="switch" checked={d.active} onChange={(e) => up('active', e.target.checked)} style={{ width: 44, height: 24, margin: 0, accentColor: 'var(--brand)' }} />
                {d.active ? 'เปิดอยู่' : 'ปิดอยู่'}
              </label>
            </div>

            {msg && <div role="status" className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { const j = jobs.data?.find((x) => x.job_id === d.job_id); setD(j ? toDraft(j) : emptyDraft()); setMsg(null); }}>ยกเลิกการแก้ไข</button>
              <button type="button" className="btn primary" disabled={!canSave} onClick={() => void save()}>
                {busy ? 'กำลังบันทึก…' : canSave ? 'บันทึกตำแหน่ง' : sumOk ? 'กรอกข้อมูลที่จำเป็นให้ครบ' : 'บันทึกไม่ได้ — น้ำหนักรวมต้องเท่ากับ 100%'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
