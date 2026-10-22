import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type ApplicantItem, type ApplicantKind, type ApplicantSort } from '../api';
import { KIND_BAR, KIND_LABEL, MAX_SKILL_CHIPS, STATUS_LABEL, downloadCsv, fmtShort, itemNote, useAsync } from '../lib';
import { useStats } from '../stats';
import { ErrorBox, ErrorPeek, Loading, PageHead, ScoreRing } from '../ui';

const KINDS: ['all' | ApplicantKind, string][] = [
  ['all', 'ทั้งหมด'], ['pass', 'ผ่านเกณฑ์'], ['below', 'ต่ำกว่าเกณฑ์'], ['gate', 'ติด Gate'], ['pending', 'รอประมวลผล'], ['failed', 'สแกนล้มเหลว']
];
const SIZES = [25, 50, 100];
const MAX_COMPARE = 3;
const MAX_SELECT = 50; // เลือกพร้อมกันได้สูงสุดกี่คน (ใช้ทำเครื่องหมายอ่านแล้ว/ยังไม่อ่านพร้อมกัน)

const Star = ({ on }: { on: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z" />
  </svg>
);

/** เลขหน้าที่แสดง: 1 … n-1 n n+1 … last */
function pageList(cur: number, last: number): (number | '…')[] {
  const set = new Set([1, 2, cur - 1, cur, cur + 1, last - 1, last].filter((p) => p >= 1 && p <= last));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of [...set].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/** รายชื่อผู้สมัครของตำแหน่งหนึ่ง: ดึงจากเซิร์ฟเวอร์ทีละหน้า ตัวกรองทั้งหมดเก็บใน URL (แชร์/กลับมาหน้าเดิมได้) */
export default function PositionApplicants() {
  const { jobId = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { stats, reload: reloadStats } = useStats();
  const stat = stats?.find((s) => s.job_id === jobId) ?? null;

  const q = sp.get('q') ?? '';
  const kind = (sp.get('kind') ?? 'all') as 'all' | ApplicantKind;
  const appStatus = sp.get('st') ?? '';
  const unread = sp.get('unread') === '1';
  const starred = sp.get('star') === '1';
  const sort = (sp.get('sort') ?? 'score') as ApplicantSort;
  const size = SIZES.includes(Number(sp.get('size'))) ? Number(sp.get('size')) : 25;
  const page = Math.max(1, Number(sp.get('page')) || 1);

  /** เปลี่ยนตัวกรอง (กลับไปหน้า 1 เสมอ ยกเว้นเปลี่ยนหน้า) */
  function setParams(patch: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    if (!keepPage) next.delete('page');
    setSp(next, { replace: true });
  }

  // ช่องค้นหา: หน่วง 300ms ก่อนยิงคำค้นไปที่เซิร์ฟเวอร์
  const [qText, setQText] = useState(q);
  useEffect(() => {
    if (qText === q) return;
    const t = setTimeout(() => setParams({ q: qText.trim() || null }), 300);
    return () => clearTimeout(t);
     
  }, [qText]);

  const [version, setVersion] = useState(0); // เพิ่มค่าเพื่อโหลดรายการใหม่หลังแก้ข้อมูล
  const list = useAsync(() => api.listApplicants({ jobId, q, kind, appStatus, unread, starred, sort, page, pageSize: size }), [jobId, q, kind, appStatus, unread, starred, sort, page, size, version]);
  const total = list.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (list.data && page > lastPage) setParams({ page: String(lastPage) }, true);   }, [list.data, lastPage]);

  const [selected, setSelected] = useState<Map<string, string>>(new Map()); // id → ชื่อ (เก็บข้ามหน้า)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const items = list.data?.items ?? [];

  // มีคนที่ยังประมวลผลอยู่ → โหลดรายการใหม่เองทุก 10 วินาที จนกว่าจะเสร็จ (ไม่ต้องกดรีเฟรช)
  const hasPending = items.some((it) => it.kind === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => { setVersion((v) => v + 1); reloadStats(); }, 10000);
    return () => clearInterval(t);
  }, [hasPending, reloadStats]);

  function toggleSel(it: ApplicantItem) {
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(it.candidate.candidate_id)) n.delete(it.candidate.candidate_id);
      else if (n.size < MAX_SELECT) n.set(it.candidate.candidate_id, it.candidate.full_name);
      return n;
    });
  }

  async function markRead(ids: string[], read: boolean) {
    setNotice(null);
    try {
      await api.setRead(ids, read);
      setNotice({ ok: true, text: `ทำเครื่องหมาย “${read ? 'อ่านแล้ว' : 'ยังไม่อ่าน'}” ${ids.length} คนแล้ว` });
      setSelected(new Map());
      setVersion((v) => v + 1);
      reloadStats();
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' }); }
  }

  async function rescan(ids: string[]) {
    setNotice(null);
    try {
      const n = await api.retryMany(ids);
      setNotice({ ok: true, text: `ส่ง ${n} คนเข้าคิวสแกนใหม่แล้ว ระบบประมวลผลทีละไม่เกิน 5 คนทุก 5 นาที ผลจะอัปเดตเองในหน้านี้` });
      setSelected(new Map());
      setVersion((v) => v + 1);
      reloadStats();
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'สั่งสแกนซ้ำไม่สำเร็จ' }); }
  }

  async function toggleStar(it: ApplicantItem) {
    try {
      await api.setStarred(it.candidate.candidate_id, !it.candidate.starred);
      setVersion((v) => v + 1);
      reloadStats();
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' }); }
  }

  // ส่งออก CSV: ใช้ตัวกรองเดียวกับที่เห็นอยู่ ดึงมาทีละ 500 ราย
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const rows: unknown[][] = [['รหัสผู้สมัคร', 'ชื่อ-นามสกุล', 'อีเมล', 'เบอร์โทร', 'ตำแหน่ง', 'คะแนน', 'ผลการประเมิน', 'Gate', 'สถานะการพิจารณา', 'ประสบการณ์ที่แจ้ง', 'ทักษะที่พบ', 'ติดดาว', 'อ่านแล้ว', 'สมัครเมื่อ', 'โน้ต HR']];
      for (let p = 1; ; p++) {
        const r = await api.listApplicants({ jobId, q, kind, appStatus, unread, starred, sort, page: p, pageSize: 500 });
        for (const it of r.items) {
          const c = it.candidate;
          rows.push([c.candidate_id, c.full_name, c.email, c.phone_number, c.applied_position, it.score ?? '', KIND_LABEL[it.kind], it.gate ?? '', STATUS_LABEL[c.application_status] ?? c.application_status, c.self_reported_experience_range ?? '', c.skills.join('; '), c.starred ? 'ใช่' : '', c.is_read ? 'อ่านแล้ว' : 'ยังไม่อ่าน', c.received_at, c.hr_note ?? '']);
        }
        if (p * 500 >= r.total || r.items.length === 0) break;
      }
      downloadCsv(`${stat?.position_name ?? jobId}-ผู้สมัคร.csv`, rows);
      void api.logExport(stat?.position_name ?? String(jobId), rows.length - 1);
      setNotice({ ok: true, text: `ส่งออก ${rows.length - 1} รายการแล้ว (เปิดด้วย Excel ได้)` });
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'ส่งออกไม่สำเร็จ' }); }
    finally { setExporting(false); }
  }

  // ลบที่อ่านแล้ว: ต้องยืนยันก่อนเสมอ
  const [del, setDel] = useState<{ count: number; ack: boolean; busy: boolean } | null>(null);
  async function askDelete() {
    setNotice(null);
    try { setDel({ count: await api.countDeletableRead(jobId), ack: false, busy: false }); }
    catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'ตรวจจำนวนไม่สำเร็จ' }); }
  }
  async function doDelete() {
    setDel((d) => d && { ...d, busy: true });
    try {
      const n = await api.deleteReadCandidates(jobId);
      setNotice({ ok: true, text: `ลบผู้สมัครที่อ่านแล้ว ${n} คนเรียบร้อย` });
      setDel(null);
      setSelected(new Map());
      setVersion((v) => v + 1);
      reloadStats();
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'ลบไม่สำเร็จ' });
      setDel(null);
    }
  }

  const selIds = [...selected.keys()];
  const maxBucket = useMemo(() => Math.max(1, ...(stat?.buckets ?? [1])), [stat]);
  const counts: Record<string, number> = stat ? { all: stat.total, pass: stat.passed, below: stat.below, gate: stat.gate, pending: stat.pending, failed: stat.failed } : {};

  if (stats && !stat) return <main className="page"><div className="empty">ไม่พบตำแหน่งรหัส {jobId}</div><Link to="/positions">← กลับไปเลือกตำแหน่ง</Link></main>;

  return (
    <main className="page">
      <Link to="/positions" style={{ fontSize: 14.5, fontWeight: 600, textDecoration: 'none' }}>← ผู้สมัครรายตำแหน่ง</Link>
      <PageHead title={stat?.position_name ?? 'กำลังโหลด…'} sub={stat ? `${stat.job_id} · เกณฑ์ผ่าน ${stat.match_threshold} คะแนน · ${stat.is_active ? 'เปิดรับสมัคร' : 'ปิดรับสมัคร'}` : undefined}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="btn" disabled={exporting || total === 0} onClick={() => void exportCsv()}>{exporting ? 'กำลังส่งออก…' : 'ส่งออก CSV / Excel'}</button>
          <button type="button" className="btn" onClick={() => void askDelete()}>ลบที่อ่านแล้ว</button>
        </div>
      </PageHead>

      {stat && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: '1.2 1 460px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            <div className="stat"><div className="k">ผู้สมัคร</div><div className="v">{stat.total}</div></div>
            <div className="stat"><div className="k">ยังไม่อ่าน</div><div className="v" style={{ color: 'var(--brand)' }}>{stat.unread}</div></div>
            <div className="stat"><div className="k">ผ่านเกณฑ์</div><div className="v" style={{ color: 'var(--accent)' }}>{stat.passed}</div></div>
            <div className="stat"><div className="k">คะแนนเฉลี่ย</div><div className="v">{stat.avg_score ?? '—'}</div></div>
          </div>
          <div className="card" style={{ flex: '1 1 340px', padding: '14px 18px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>การกระจายคะแนน <span className="muted" style={{ fontWeight: 400 }}>(เส้นประ = เกณฑ์ผ่าน {stat.match_threshold})</span></span>
            <div role="img" aria-label={`จำนวนผู้สมัครแยกตามช่วงคะแนน ${stat.buckets.join(', ')}`} style={{ position: 'relative', height: 64, display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: '1px solid #cfd9d3' }}>
              {stat.buckets.map((n, i) => <div key={i} title={`${i * 10}–${(i + 1) * 10}: ${n} คน`} style={{ flex: 1, height: n ? 6 + (n / maxBucket) * 56 : 3, background: i * 10 >= stat.match_threshold ? 'var(--accent)' : '#bcd6c8', borderRadius: '3px 3px 0 0' }} />)}
              <div style={{ position: 'absolute', left: `${stat.match_threshold}%`, top: 0, bottom: 0, borderLeft: '2px dashed var(--ink)' }} />
            </div>
          </div>
        </div>
      )}

      {del && (
        <div className="confirmbox" role="alertdialog" aria-label="ยืนยันการลบ">
          {del.count === 0
            ? <><b>ไม่มีผู้สมัครที่ลบได้</b><span>ต้องเป็นผู้สมัครที่อ่านแล้ว และไม่ได้ติดดาว และสถานะไม่ใช่ “รับเข้าทำงาน”</span><div><button type="button" className="btn small" onClick={() => setDel(null)}>ปิด</button></div></>
            : <>
              <b style={{ color: 'var(--danger-ink)' }}>จะลบผู้สมัครที่อ่านแล้ว {del.count} คนของตำแหน่ง {stat?.position_name} ถาวร</b>
              <span style={{ fontSize: 14.5, lineHeight: 1.6 }}>ลบทั้งใบสมัคร ไฟล์ Resume ผลการประเมิน และประวัติการประมวลผล <b>กู้คืนไม่ได้</b> · ไม่ลบคนที่ติดดาว และคนที่สถานะ “รับเข้าทำงาน”</span>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14.5 }}><input className="chk" type="checkbox" checked={del.ack} onChange={(e) => setDel({ ...del, ack: e.target.checked })} /> ฉันเข้าใจว่าลบแล้วกู้คืนไม่ได้</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn danger" disabled={!del.ack || del.busy} onClick={() => void doDelete()}>{del.busy ? 'กำลังลบ…' : `ลบ ${del.count} คน`}</button>
                <button type="button" className="btn" disabled={del.busy} onClick={() => setDel(null)}>ยกเลิก</button>
              </div>
            </>}
        </div>
      )}
      {notice && <div role="status" className={`alert ${notice.ok ? 'ok' : 'err'}`}>{notice.text}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="aq" className="muted" style={{ fontSize: 13.5 }}>ค้นหา</label>
          <input id="aq" className="input" type="search" style={{ height: 44, width: 260 }} placeholder="ชื่อ อีเมล หรือรหัสผู้สมัคร" value={qText} onChange={(e) => setQText(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ast" className="muted" style={{ fontSize: 13.5 }}>สถานะการพิจารณา</label>
          <select id="ast" className="select" style={{ height: 44 }} value={appStatus} onChange={(e) => setParams({ st: e.target.value })}>
            <option value="">ทั้งหมด</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="aso" className="muted" style={{ fontSize: 13.5 }}>เรียงตาม</label>
          <select id="aso" className="select" style={{ height: 44 }} value={sort} onChange={(e) => setParams({ sort: e.target.value === 'score' ? null : e.target.value })}>
            <option value="score">คะแนนสูงสุด</option>
            <option value="recent">สมัครล่าสุด</option>
            <option value="unread">ยังไม่อ่านก่อน</option>
            <option value="name">ชื่อ ก–ฮ</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="asz" className="muted" style={{ fontSize: 13.5 }}>ต่อหน้า</label>
          <select id="asz" className="select" style={{ height: 44 }} value={size} onChange={(e) => setParams({ size: e.target.value === '25' ? null : e.target.value })}>
            {SIZES.map((n) => <option key={n} value={n}>{n} คน</option>)}
          </select>
        </div>
        <button type="button" className="tab" aria-pressed={unread} onClick={() => setParams({ unread: unread ? null : '1' })}>เฉพาะยังไม่อ่าน{stat ? ` (${stat.unread})` : ''}</button>
        <button type="button" className="tab" aria-pressed={starred} onClick={() => setParams({ star: starred ? null : '1' })}>★ ติดดาว{stat ? ` (${stat.starred})` : ''}</button>
      </div>

      <div role="group" aria-label="กรองตามผลการประเมิน" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" className="tab" aria-pressed={kind === k} onClick={() => setParams({ kind: k === 'all' ? null : k })}>{label}{stat ? <span style={{ opacity: .85 }}> ({counts[k] ?? 0})</span> : null}</button>
        ))}
      </div>

      {list.error && <ErrorBox message={list.error} />}
      {list.loading && !list.data && <Loading />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: list.loading && list.data ? 0.6 : 1, transition: 'opacity .15s' }}>
        {list.data && items.length === 0 && <div className="empty">{(stat?.total ?? 0) === 0 ? `ยังไม่มีผู้สมัครตำแหน่ง ${stat?.position_name ?? ''}` : 'ไม่พบผู้สมัครตามเงื่อนไขที่เลือก'}</div>}
        {items.map((it) => {
          const c = it.candidate;
          const sel = selected.has(c.candidate_id);
          return (
            <div key={c.candidate_id} className={`arow${c.is_read ? '' : ' unread'}${sel ? ' sel' : ''}`}>
              <input className="chk ctl" type="checkbox" checked={sel} disabled={!sel && selected.size >= MAX_SELECT} onChange={() => toggleSel(it)} aria-label={`เลือก ${c.full_name}`} />
              <button type="button" className="starbtn" aria-pressed={c.starred} aria-label={c.starred ? `เอา ${c.full_name} ออกจาก Shortlist` : `ติดดาว ${c.full_name}`} title={c.starred ? 'เอาออกจาก Shortlist' : 'ติดดาว (Shortlist)'} onClick={() => void toggleStar(it)}><Star on={c.starred} /></button>
              <div style={{ minWidth: 0 }}>
                <Link className="name stretch" to={`/candidate/${c.candidate_id}?job=${jobId}`}>
                  {!c.is_read && <><span className="udot" aria-hidden="true" style={{ marginRight: 8 }} /><span className="sr-only">ยังไม่อ่าน </span></>}{c.full_name}
                </Link>
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}><span className="mono">{c.candidate_id}</span> · สมัคร {fmtShort(c.received_at)}{c.application_status !== 'In Review' && <> · <b>{STATUS_LABEL[c.application_status] ?? c.application_status}</b></>}</div>
                {c.hr_note && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--brand-dark)' }} title={c.hr_note}>📝 {c.hr_note.length > 60 ? c.hr_note.slice(0, 60) + '…' : c.hr_note}</div>}
              </div>
              <div className="c-skills" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.skills.slice(0, MAX_SKILL_CHIPS).map((s) => <span className="chip" key={s}>{s}</span>)}
                  {c.skills.length > MAX_SKILL_CHIPS && <span className="chip" title={c.skills.slice(MAX_SKILL_CHIPS).join(', ')}>+{c.skills.length - MAX_SKILL_CHIPS}</span>}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>ประสบการณ์ที่แจ้ง: {c.self_reported_experience_range ?? 'ไม่ระบุ'}</div>
              </div>
              <div className="c-score">
                {it.score !== null && c.processing_status === 'processed' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ScoreRing value={it.score} color={KIND_BAR[it.kind]} size={52} />
                    <div><div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.score.toFixed(1)} / 100</div><div className="muted" style={{ fontSize: 12.5 }}>เกณฑ์ {stat?.match_threshold}</div></div>
                  </div>
                ) : <span className="muted" style={{ fontSize: 14 }}>ยังไม่มีคะแนน</span>}
              </div>
              <div className="c-kind" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className={`pill ${it.kind}`}>{KIND_LABEL[it.kind]}</span>
                  {it.kind === 'failed' && <ErrorPeek message={c.processing_error} align="right" />}
                </span>
                <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{itemNote(it, stat?.match_threshold ?? 0)}</span>
              </div>
              <div className="c-act" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                {it.kind !== 'failed' && it.kind !== 'pending' && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand)' }}>ดูรายละเอียด →</span>}
                {it.kind !== 'pending' && <button className="btn small ctl" type="button" title="ให้ระบบอ่าน Resume และคิดคะแนนใหม่" onClick={() => void rescan([c.candidate_id])}>สแกนซ้ำ</button>}
              </div>
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <nav className="pager" aria-label="แบ่งหน้า">
          <span className="muted" style={{ fontSize: 14 }}>แสดง {(page - 1) * size + 1}–{Math.min(page * size, total)} จาก {total} คน</span>
          <div className="pages">
            <button type="button" className="pg" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, true)}>‹ ก่อนหน้า</button>
            {pageList(page, lastPage).map((p, i) => p === '…' ? <span key={`e${i}`} className="muted" style={{ alignSelf: 'center' }}>…</span>
              : <button key={p} type="button" className="pg" aria-current={p === page ? 'page' : undefined} onClick={() => setParams({ page: String(p) }, true)}>{p}</button>)}
            <button type="button" className="pg" disabled={page >= lastPage} onClick={() => setParams({ page: String(page + 1) }, true)}>ถัดไป ›</button>
          </div>
        </nav>
      )}

      {selIds.length > 0 && (
        <div className="selbar" role="region" aria-label="รายการที่เลือก">
          <b>เลือกแล้ว {selIds.length} คน</b>
          <button type="button" className="btn small primary" disabled={selIds.length < 2 || selIds.length > MAX_COMPARE} title="เลือก 2–3 คน" onClick={() => nav(`/compare?job=${jobId}&ids=${selIds.join(',')}`)}>เปรียบเทียบ{selIds.length > MAX_COMPARE ? ' (เลือกไม่เกิน 3)' : ''}</button>
          <button type="button" className="btn small" onClick={() => void markRead(selIds, true)}>ทำเป็นอ่านแล้ว</button>
          <button type="button" className="btn small" onClick={() => void markRead(selIds, false)}>ทำเป็นยังไม่อ่าน</button>
          <button type="button" className="btn small" title="ให้ระบบอ่าน Resume และคิดคะแนนใหม่" onClick={() => void rescan(selIds)}>สแกนซ้ำที่เลือก</button>
          <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setSelected(new Map())}>ล้างที่เลือก</button>
        </div>
      )}
    </main>
  );
}
