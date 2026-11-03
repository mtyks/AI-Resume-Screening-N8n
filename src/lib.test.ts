import { describe, expect, it } from 'vitest';
import { addDays, bkkToday, csvCell, expFlag, fmtRangeTh, groupPeople, itemNote, mustAvg, presetRange } from './lib';
import type { Candidate, Job } from './api';

describe('csvCell', () => {
  it('ครอบด้วย " และ escape เครื่องหมายคำพูด', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it('กัน CSV formula injection', () => {
    for (const bad of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx']) {
      expect(csvCell(bad).startsWith(`"'`)).toBe(true);
    }
  });
  it('null/undefined เป็นช่องว่าง', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

const job = { min_experience_years: 3 } as Job;
const cand = (range: string | null) => ({ self_reported_experience_range: range }) as Candidate;

describe('expFlag', () => {
  it('ไม่กำหนดขั้นต่ำ = na', () => {
    expect(expFlag(cand('1-3 ปี'), { ...job, min_experience_years: 0 }).level).toBe('na');
  });
  it('ไม่ระบุ = unknown', () => {
    expect(expFlag(cand(null), job).level).toBe('unknown');
  });
  it('ช่วงบนต่ำกว่าเกณฑ์ = low', () => {
    expect(expFlag(cand('1-3 ปี'), { ...job, min_experience_years: 4 }).level).toBe('low');
    expect(expFlag(cand('ไม่มีประสบการณ์ (นักศึกษาจบใหม่)'), job).level).toBe('low');
  });
  it('ถึงเกณฑ์ = ok', () => {
    expect(expFlag(cand('3-5 ปี'), job).level).toBe('ok');
    expect(expFlag(cand('มากกว่า 5 ปี'), job).level).toBe('ok');
  });
});

describe('itemNote', () => {
  it('บอกคะแนนที่ขาดถึงเกณฑ์', () => {
    expect(itemNote({ kind: 'below', score: 55.5 } as never, 60)).toBe('ขาด 4.5 คะแนนถึงเกณฑ์');
  });
});

describe('mustAvg', () => {
  it('ข้อที่พบ (>= 50) นับเต็ม 100', () => {
    expect(mustAvg([{ confidence: 75 }, { confidence: 75 }])).toBe(100);
    expect(mustAvg([{ confidence: 50 }])).toBe(100);
  });
  it('ข้อที่ไม่ถึงเกณฑ์นับตามจริง', () => {
    expect(mustAvg([{ confidence: 80 }, { confidence: 20 }])).toBe(60);
    expect(mustAvg([])).toBe(0);
  });
});

describe('groupPeople', () => {
  const mk = (id: string, email: string, name: string, pos: string, at: string) => ({
    candidate: { candidate_id: id, full_name: name, phone_number: '0812345678', email, applied_position: pos, self_reported_experience_range: null, skills: [], resume_file_url: '', received_at: at, application_status: 'In Review', processing_status: 'processed' as const, processing_error: null, is_read: false, starred: false, hr_note: null },
    job_id: 'J', threshold: 70, score: 80, gate: 'Pass', kind: 'pass' as const
  });
  it('รวมใบสมัครของอีเมลเดียวกัน (ไม่สนตัวพิมพ์) เป็นคนเดียว เรียงใหม่สุดก่อน', () => {
    const r = groupPeople([mk('1', 'A@x.com', 'เอ', 'Backend', '2026-10-01'), mk('2', 'a@x.com', 'เอ', 'Frontend', '2026-10-05'), mk('3', 'b@x.com', 'บี', 'QA Tester', '2026-09-01')]);
    expect(r).toHaveLength(2);
    expect(r[0].applications.map((a) => a.candidate.candidate_id)).toEqual(['2', '1']);
    expect(r[1].name).toBe('บี');
  });
});

describe('ช่วงวันที่ Dashboard', () => {
  it('addDays ข้ามเดือนและปีได้', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('bkkToday ใช้เวลาไทย (เลย 17:00 UTC = วันถัดไป)', () => {
    expect(bkkToday(new Date('2026-11-03T18:30:00Z'))).toBe('2026-11-04');
    expect(bkkToday(new Date('2026-11-03T16:30:00Z'))).toBe('2026-11-03');
  });
  it('presetRange: วันนี้ เมื่อวาน และ 7 วันล่าสุดนับรวมวันนี้', () => {
    expect(presetRange('today', '2026-11-03')).toEqual({ from: '2026-11-03', to: '2026-11-03' });
    expect(presetRange('yesterday', '2026-11-03')).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(presetRange('7', '2026-11-03')).toEqual({ from: '2026-10-28', to: '2026-11-03' });
  });
  it('fmtRangeTh วันเดียวไม่ใส่ช่วง', () => {
    expect(fmtRangeTh('2026-11-03', '2026-11-03')).not.toContain('–');
    expect(fmtRangeTh('2026-10-28', '2026-11-03')).toContain('–');
  });
});
