import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type CriterionEval } from '../api';
import { KIND_BAR, KIND_LABEL, STATUS_LABEL, expFlag, fmtShort, rowKind, useAsync } from '../lib';
import { ErrorBox, Loading, PageHead, ScoreRing } from '../ui';

/** เปรียบเทียบผู้สมัคร 2–3 คนของตำแหน่งเดียวกัน: คะแนน Gate และความมั่นใจรายเกณฑ์เรียงข้างกัน (ช่องที่สูงสุดในแถวถูกไฮไลต์) */
export default function Compare() {
  const [sp] = useSearchParams();
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean).slice(0, 3);
  const jobId = sp.get('job') ?? '';
  const back = jobId ? `/positions/${jobId}` : '/positions';
  const data = useAsync(async () => (await Promise.all(ids.map((id) => api.getCandidate(id)))).filter((x): x is NonNullable<typeof x> => x !== null), [ids.join(',')]);

  if (ids.length < 2) return <main className="page"><div className="empty">เลือกผู้สมัครอย่างน้อย 2 คนจากหน้ารายชื่อก่อน</div><Link to={back}>← กลับไปรายชื่อ</Link></main>;
  if (data.loading && !data.data) return <main className="page"><Loading /></main>;
  if (data.error) return <main className="page"><ErrorBox message={data.error} /></main>;
  const cols = data.data ?? [];
  const job = cols[0]?.job ?? null;

  const groups: [string, string[], 'must_have_evaluation' | 'preferred_evaluation' | 'tool_evaluation'][] = job ? [
    ['ทักษะที่ต้องมี', job.must_have_skills, 'must_have_evaluation'],
    ['ทักษะที่ควรมี', job.preferred_skills, 'preferred_evaluation'],
    ['เครื่องมือ', job.required_tools, 'tool_evaluation']
  ] : [];
  const conf = (col: (typeof cols)[number], key: (typeof groups)[number][2], name: string): number | null =>
    col.match?.evaluation_detail?.[key]?.find((x: CriterionEval) => x.criterion === name)?.confidence ?? null;

  const bestScore = Math.max(...cols.map((c) => c.match?.match_score ?? -1));

  return (
    <main className="page">
      <Link to={back} style={{ fontSize: 14.5, fontWeight: 600, textDecoration: 'none' }}>← กลับไปรายชื่อ</Link>
      <PageHead title="เปรียบเทียบผู้สมัคร" sub={job ? `ตำแหน่ง ${job.position_name} · เกณฑ์ผ่าน ${job.match_threshold} คะแนน` : undefined} />

      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table className="cmp" style={{ minWidth: 190 + cols.length * 210 }}>
          <thead>
            <tr>
              <th className="rowh" />
              {cols.map((c) => (
                <th key={c.candidate.candidate_id}>
                  <Link to={`/candidate/${c.candidate.candidate_id}?job=${jobId}`} style={{ fontFamily: 'var(--display)', fontSize: 17 }}>{c.candidate.full_name}</Link>
                  <div className="muted mono" style={{ fontSize: 12.5, fontWeight: 400 }}>{c.candidate.candidate_id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="rowh">คะแนนจับคู่</th>
              {cols.map((c) => {
                const k = job ? rowKind({ candidate: c.candidate, match: c.match }, job) : 'pending';
                return (
                  <td key={c.candidate.candidate_id} className={c.match && c.match.match_score === bestScore ? 'best' : ''}>
                    {c.match ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><ScoreRing value={c.match.match_score} color={KIND_BAR[k]} size={52} /><span style={{ fontSize: 18 }}>{c.match.match_score.toFixed(1)}</span></div> : <span className="muted">ยังไม่มีคะแนน</span>}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="rowh">ผลการประเมิน</th>
              {cols.map((c) => { const k = job ? rowKind({ candidate: c.candidate, match: c.match }, job) : 'pending'; return <td key={c.candidate.candidate_id}><span className={`pill ${k}`}>{KIND_LABEL[k]}</span></td>; })}
            </tr>
            <tr>
              <th className="rowh">Gate (ทักษะที่ต้องมี)</th>
              {cols.map((c) => <td key={c.candidate.candidate_id}>{c.match ? (c.match.gate_status === 'Pass' ? 'ผ่าน' : c.match.gate_status.replace('Failed: ', 'ไม่ผ่าน — ')) : '—'}</td>)}
            </tr>
            <tr>
              <th className="rowh">ประสบการณ์ที่แจ้ง</th>
              {cols.map((c) => <td key={c.candidate.candidate_id}>{c.candidate.self_reported_experience_range ?? 'ไม่ระบุ'}{job && expFlag(c.candidate, job).level === 'low' && <div className="muted" style={{ fontSize: 12.5 }}>ต่ำกว่าเกณฑ์ขั้นต่ำ {job.min_experience_years} ปี</div>}</td>)}
            </tr>
            <tr>
              <th className="rowh">สถานะการพิจารณา</th>
              {cols.map((c) => <td key={c.candidate.candidate_id}>{STATUS_LABEL[c.candidate.application_status] ?? c.candidate.application_status}{c.candidate.starred && ' · ★'}</td>)}
            </tr>
            <tr>
              <th className="rowh">สมัครเมื่อ</th>
              {cols.map((c) => <td key={c.candidate.candidate_id}>{fmtShort(c.candidate.received_at)}</td>)}
            </tr>
            {groups.map(([title, names, key]) => names.length === 0 ? null : (
              <Fragment key={title}>
                <tr><th colSpan={cols.length + 1} style={{ background: '#f6faf7', fontSize: 13, color: 'var(--muted)' }}>{title} — ความมั่นใจของ AI (0–100, ≥ 50 ถือว่าพบ)</th></tr>
                {names.map((n) => {
                  const vals = cols.map((c) => conf(c, key, n));
                  const top = Math.max(...vals.map((v) => v ?? -1));
                  return (
                    <tr key={`${key}-${n}`}>
                      <th className="rowh">{n}</th>
                      {vals.map((v, i) => <td key={cols[i].candidate.candidate_id} className={v !== null && v === top && v >= 50 ? 'best' : v !== null && v < 50 ? 'miss' : ''}>{v === null ? '—' : v}</td>)}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            <tr>
              <th className="rowh">ทักษะที่พบ</th>
              {cols.map((c) => <td key={c.candidate.candidate_id}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{c.candidate.skills.length ? c.candidate.skills.map((s) => <span key={s} className="chip">{s}</span>) : '—'}</div></td>)}
            </tr>
            <tr>
              <th className="rowh">โน้ต HR</th>
              {cols.map((c) => <td key={c.candidate.candidate_id} style={{ whiteSpace: 'pre-wrap' }}>{c.candidate.hr_note ?? '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
