import { describe, expect, it } from 'vitest';
import { csvCell, expFlag, itemNote } from './lib';
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
