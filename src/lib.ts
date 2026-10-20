import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candidate, CandidateRow, Job } from './api';

/** โหลดข้อมูลแบบ async พร้อมสถานะ loading/error และ reload() */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);
  return { data, loading, error, reload: run };
}

const TZ = 'Asia/Bangkok';

/** 2026-10-19 14:21:03 (เวลาไทย) */
export function fmtStamp(iso: string): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

/** 19 ต.ค. 14:20 */
export function fmtShort(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export type RowKind = 'pass' | 'below' | 'gate' | 'pending' | 'failed';

export function rowKind(row: CandidateRow, job: Job): RowKind {
  const { candidate: c, match: m } = row;
  if (c.processing_status === 'failed') return 'failed';
  if (c.processing_status === 'pending' || !m) return 'pending';
  if (m.gate_status !== 'Pass') return 'gate';
  return m.match_score >= job.match_threshold ? 'pass' : 'below';
}

export const KIND_LABEL: Record<RowKind, string> = {
  pass: 'ผ่านเกณฑ์',
  below: 'ต่ำกว่าเกณฑ์',
  gate: 'ไม่ผ่าน Gate',
  pending: 'รอประมวลผล',
  failed: 'ประมวลผลไม่สำเร็จ'
};

export const KIND_BAR: Record<RowKind, string> = {
  pass: 'var(--accent)',
  below: 'var(--warn-bar)',
  gate: 'var(--danger-bar)',
  pending: 'var(--muted)',
  failed: 'var(--muted)'
};

/** คำอธิบายวิธีคิดคะแนน (มีแบบเดียว) แสดงในหน้ารายละเอียดผู้สมัคร */
export const SCORE_NOTE = 'คำนวณจากทักษะและเครื่องมือเท่านั้น ประสบการณ์ไม่นำมาคิดคะแนน';

export function rangeUpperYears(r: string | null): number | null {
  if (!r) return null;
  if (r.startsWith('ไม่มีประสบการณ์')) return 0;
  const nums = (r.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return null;
  if (r.startsWith('น้อยกว่า')) return nums[0] - 0.01;
  if (r.startsWith('มากกว่า')) return Infinity;
  return Math.max(...nums);
}

export interface ExpFlag { level: 'ok' | 'low' | 'unknown' | 'na'; label: string }

/** ธงให้ HR: เทียบช่วงประสบการณ์ที่ผู้สมัครแจ้ง กับขั้นต่ำของตำแหน่ง (ไม่นำมาคิดคะแนน) */
export function expFlag(c: Candidate, job: Job): ExpFlag {
  if (job.min_experience_years <= 0) return { level: 'na', label: 'ตำแหน่งนี้ไม่กำหนดขั้นต่ำประสบการณ์' };
  const up = rangeUpperYears(c.self_reported_experience_range);
  if (up === null) return { level: 'unknown', label: 'ผู้สมัครไม่ได้ระบุประสบการณ์' };
  if (up < job.min_experience_years) return { level: 'low', label: `ประสบการณ์ที่แจ้งต่ำกว่าเกณฑ์ (ต้องการ ≥ ${job.min_experience_years} ปี)` };
  return { level: 'ok', label: `ตรงเกณฑ์ประสบการณ์ที่แจ้ง (≥ ${job.min_experience_years} ปี)` };
}

export function expText(row: CandidateRow): string {
  const { candidate: c } = row;
  return `ประสบการณ์ที่ผู้สมัครแจ้ง: ${c.self_reported_experience_range ?? 'ไม่ระบุ'}`;
}

export function kindNote(kind: RowKind, row: CandidateRow, job: Job): string {
  const { candidate: c, match: m } = row;
  switch (kind) {
    case 'pass': return 'ส่งต่อให้ HR พิจารณา';
    case 'below': return m ? `ขาด ${(job.match_threshold - m.match_score).toFixed(1)} คะแนนถึงเกณฑ์` : '';
    case 'gate': return m ? m.gate_status.replace('Failed: ', '') : '';
    case 'failed': return c.processing_error ?? '';
    default: return 'กำลังอยู่ในคิว';
  }
}

/** ป้ายสถานะการสมัครที่ HR เห็น (ค่าที่เก็บใน DB ยังเป็น In Review / Hired / Rejected ตาม check constraint) */
export const STATUS_LABEL: Record<string, string> = {
  'In Review': 'กำลังพิจารณา',
  Hired: 'รับเข้าทำงาน',
  Rejected: 'ไม่รับ'
};

/** จำนวนทักษะที่แสดงในแถวผู้สมัคร ส่วนที่เหลือรวมเป็น "+N" (ดูครบในหน้ารายละเอียด) */
export const MAX_SKILL_CHIPS = 3;
