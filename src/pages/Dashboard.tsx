import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isReal } from '../api';
import { KIND_BAR, KIND_LABEL, MAX_SKILL_CHIPS, expFlag, expText, fmtShort, kindNote, rowKind, useAsync, type RowKind } from '../lib';
import { ErrorBox, Loading, PageHead, ScoreRing } from '../ui';

const TABS: ['all' | RowKind, string][] = [
  ['all', 'ทั้งหมด'], ['pass', 'ผ่านเกณฑ์'], ['below', 'ต่ำกว่าเกณฑ์'], ['gate', 'ติด Gate'], ['pending', 'รอประมวลผล'], ['failed', 'ประมวลผลไม่สำเร็จ']
];

export default function Dashboard() {
  const jobs = useAsync(() => api.listJobs(), []);
  const [jobId, setJobId] = useState('');
  const [tab, setTab] = useState<'all' | RowKind>('all');
  const [q, setQ] = useState('');
  // เรียงตามคะแนนสูงสุดก่อน (คนที่ยังไม่มีคะแนนไว้ท้าย) หรือตามเวลาที่สมัคร
  const [sort, setSort] = useState<'score' | 'recent'>('score');
  // ข้อความแจ้งผลการกดสแกนซ้ำ (แทน alert ที่ขัดจังหวะการใช้งาน)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!jobId && jobs.data?.length) setJobId(jobs.data[0].job_id);
  }, [jobs.data, jobId]);

  const job = jobs.data?.find((j) => j.job_id === jobId) ?? null;
  const rows = useAsync(() => (jobId ? api.listCandidateRows(jobId) : Promise.resolve([])), [jobId]);

  const wsum = job ? job.weight_musthave + job.weight_preferred + job.weight_tool || 1 : 1;

  const view = useMemo(() => {
    if (!job || !rows.data) return null;
    const withKind = rows.data.map((r) => ({ r, k: rowKind(r, job) }));
    const count = (k: 'all' | RowKind) => withKind.filter((x) => k === 'all' || x.k === k).length;
    const scored = rows.data.filter((r) => r.match).map((r) => r.match!.match_score);
    const avg = scored.length ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1) : '—';
    const text = q.trim().toLowerCase();
    const shown = withKind
      .filter((x) => tab === 'all' || x.k === tab)
      .filter((x) => !text || x.r.candidate.full_name.toLowerCase().includes(text) || x.r.candidate.candidate_id.toLowerCase().includes(text))
      .sort((a, b) => sort === 'recent'
        ? b.r.candidate.received_at.localeCompare(a.r.candidate.received_at)
        : (b.r.match?.match_score ?? -1) - (a.r.match?.match_score ?? -1));
    const buckets = Array.from({ length: 10 }, (_, i) => scored.filter((s) => (i === 9 ? s >= 90 : s >= i * 10 && s < (i + 1) * 10)).length);
    return { withKind, count, avg, shown, buckets };
  }, [rows.data, job, tab, q, sort]);

  return (
    <main className="page">
      <PageHead title="ผลการจับคู่ผู้สมัคร" sub={`${sort === 'score' ? 'เรียงจากคะแนนสูงสุด' : 'เรียงจากผู้สมัครล่าสุด'} · คะแนนเต็ม 100`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="jobsel" className="muted" style={{ fontSize: 13.5 }}>ตำแหน่ง</label>
            <select id="jobsel" className="select" style={{ height: 44, minWidth: 240 }} value={jobId} onChange={(e) => { setJobId(e.target.value); setTab('all'); }}>
              {jobs.data?.map((j) => <option key={j.job_id} value={j.job_id}>{j.position_name} ({j.job_id})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="q" className="muted" style={{ fontSize: 13.5 }}>ค้นหา</label>
            <input id="q" className="input" type="search" style={{ height: 44, width: 220 }} placeholder="ชื่อ หรือรหัสผู้สมัคร" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="sortsel" className="muted" style={{ fontSize: 13.5 }}>เรียงตาม</label>
            <select id="sortsel" className="select" style={{ height: 44 }} value={sort} onChange={(e) => setSort(e.target.value as 'score' | 'recent')}>
              <option value="score">คะแนนสูงสุด</option>
              <option value="recent">สมัครล่าสุด</option>
            </select>
          </div>
        </div>
      </PageHead>

      {(jobs.error || rows.error) && <ErrorBox message={jobs.error ?? rows.error ?? ''} />}
      {(jobs.loading || (rows.loading && !rows.data)) && <Loading />}

      {job && (
        <div className="card" style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 28px', fontSize: 14.5, borderRadius: 12 }}>
          <span className="mono chip" style={{ fontSize: 13.5, borderRadius: 6 }}>{job.job_id}</span>
          <span>เกณฑ์ผ่าน <b>{job.match_threshold}</b> คะแนน</span>
          <span>ประสบการณ์ขั้นต่ำ (ใช้ติดธง ไม่คิดคะแนน) <b>{job.min_experience_years}</b> ปี</span>
          <span>น้ำหนัก: ทักษะหลัก {Math.round(job.weight_musthave / wsum * 100)}% · ทักษะเสริม {Math.round(job.weight_preferred / wsum * 100)}% · เครื่องมือ {Math.round(job.weight_tool / wsum * 100)}%</span>
          <Link to="/jobs" style={{ marginLeft: 'auto', fontWeight: 600 }}>ปรับเกณฑ์ตำแหน่งนี้</Link>
        </div>
      )}

      {job && view && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ flex: '1.2 1 480px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <div className="stat"><div className="k">ผู้สมัครทั้งหมด</div><div className="v">{view.withKind.length}</div></div>
              <div className="stat"><div className="k">ผ่านเกณฑ์ (≥ {job.match_threshold} และผ่าน Gate)</div><div className="v" style={{ color: 'var(--accent)' }}>{view.count('pass')}</div></div>
              <div className="stat"><div className="k">คะแนนเฉลี่ย (ที่ประมวลผลแล้ว)</div><div className="v">{view.avg}</div></div>
              <div className="stat"><div className="k">รอประมวลผล / ไม่สำเร็จ</div><div className="v">{view.count('pending') + view.count('failed')}</div></div>
            </div>
            <div className="card" style={{ flex: '1 1 380px', padding: '18px 20px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>การกระจายคะแนน</span>
                <span className="muted" style={{ fontSize: 13 }}>เส้นประ = เกณฑ์ผ่าน {job.match_threshold}</span>
              </div>
              <div role="img" aria-label={`จำนวนผู้สมัครแยกตามช่วงคะแนน ${view.buckets.join(', ')}`} style={{ position: 'relative', height: 120, display: 'flex', alignItems: 'flex-end', gap: 6, borderBottom: '1px solid #cfd9d3' }}>
                {view.buckets.map((n, i) => (
                  <div key={i} title={`${i * 10}–${(i + 1) * 10}: ${n} คน`} style={{ flex: 1, minWidth: 0, height: n ? 18 + n * 28 : 3, background: i * 10 >= job.match_threshold ? 'var(--accent)' : '#bcd6c8', borderRadius: '4px 4px 0 0' }} />
                ))}
                <div style={{ position: 'absolute', left: `${job.match_threshold}%`, top: 0, bottom: 0, borderLeft: '2px dashed var(--ink)' }} />
              </div>
              <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>0</span><span>50</span><span>100</span></div>
            </div>
          </div>

          {view.count('pending') + view.count('failed') > 0 && tab !== 'failed' && tab !== 'pending' && (
            <div className="alert warn" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <span>มี {view.count('pending') + view.count('failed')} รายที่ยังประมวลผลไม่เสร็จ แก้สาเหตุแล้วกด “สแกนซ้ำ” ได้ที่แถวของผู้สมัคร</span>
              <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setTab(view.count('failed') > 0 ? 'failed' : 'pending')}>ดูเฉพาะรายการเหล่านี้</button>
            </div>
          )}
          {notice && <div role="status" className={`alert ${notice.ok ? 'ok' : 'err'}`}>{notice.text}</div>}

          <div role="group" aria-label="กรองตามสถานะ" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TABS.map(([k, label]) => (
              <button key={k} type="button" className="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{label} <span style={{ opacity: 0.85 }}>({view.count(k)})</span></button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {view.shown.length === 0 && (
              <div className="empty">{view.withKind.length === 0 ? `ยังไม่มีผู้สมัครตำแหน่ง ${job.position_name}` : 'ไม่พบผู้สมัครตามเงื่อนไขที่เลือก'}</div>
            )}
            {view.shown.map(({ r, k }) => {
              const { candidate: c, match: m } = r;
              return (
                <div className="row" key={c.candidate_id}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <Link className="name stretch" to={`/candidate/${c.candidate_id}`}>{c.full_name}</Link>
                    <div className="muted" style={{ fontSize: 13, marginTop: 3 }}><span className="mono">{c.candidate_id}</span> · สมัคร {fmtShort(c.received_at)}</div>
                  </div>
                  <div style={{ flex: '1.3 1 260px', minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {c.skills.slice(0, MAX_SKILL_CHIPS).map((s) => <span className="chip" key={s}>{s}</span>)}
                      {c.skills.length > MAX_SKILL_CHIPS && <span className="chip" title={c.skills.slice(MAX_SKILL_CHIPS).join(', ')}>+{c.skills.length - MAX_SKILL_CHIPS}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{expText(r)}</div>
                    {(() => { const f = expFlag(c, job); return f.level === 'low' ? <span className="pill below" style={{ fontSize: 12.5, padding: '3px 10px', marginTop: 6 }}>{f.label}</span> : null; })()}
                  </div>
                  <div style={{ flex: '0 0 190px' }}>
                    {m && c.processing_status === 'processed' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <ScoreRing value={m.match_score} color={KIND_BAR[k]} />
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.match_score.toFixed(1)} / 100</div>
                          <div className="muted" style={{ fontSize: 12.5 }}>เกณฑ์ผ่าน {job.match_threshold}</div>
                        </div>
                      </div>
                    ) : <span className="muted" style={{ fontSize: 14 }}>ยังไม่มีคะแนน</span>}
                  </div>
                  <div style={{ flex: '0 0 190px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <span className={`pill ${k}`}>{KIND_LABEL[k]}</span>
                    <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{kindNote(k, r, job)}</span>
                  </div>
                  <div style={{ flex: '0 0 130px', display: 'flex', justifyContent: 'flex-end' }}>
                    {k === 'failed' || k === 'pending'
                      ? <button className="btn small" type="button" onClick={async () => {
                        setNotice(null);
                        try { await api.retryCandidate(c.candidate_id); setNotice({ ok: true, text: `ส่ง ${c.full_name} เข้าคิวสแกนใหม่แล้ว ระบบจะประมวลผลภายในไม่กี่นาที` }); }
                        catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : 'สั่งสแกนซ้ำไม่สำเร็จ' }); }
                        rows.reload();
                      }}>สแกนซ้ำ</button>
                      : <Link to={`/candidate/${c.candidate_id}`} style={{ fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>ดูรายละเอียด →</Link>}
                  </div>
                </div>
              );
            })}
          </div>
          {!isReal && <p className="muted" style={{ margin: 0, fontSize: 13 }}>โหมดทดลอง: ข้อมูลเป็นตัวอย่างและเก็บในเบราว์เซอร์นี้</p>}
        </>
      )}
    </main>
  );
}
