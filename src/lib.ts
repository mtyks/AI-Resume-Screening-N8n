import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApplicantItem, Candidate, CandidateRow, Job } from './api';

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
  failed: 'สแกนล้มเหลว'
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

function rangeUpperYears(r: string | null): number | null {
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

/** ป้ายสถานะการสมัครที่ HR เห็น (ค่าที่เก็บใน DB ยังเป็น In Review / Hired / Rejected ตาม check constraint) */
export const STATUS_LABEL: Record<string, string> = {
  'In Review': 'กำลังพิจารณา',
  Hired: 'รับเข้าทำงาน',
  Rejected: 'ไม่รับ'
};

/** จำนวนทักษะที่แสดงในแถวผู้สมัคร ส่วนที่เหลือรวมเป็น "+N" (ดูครบในหน้ารายละเอียด) */
export const MAX_SKILL_CHIPS = 3;

/** หมายเหตุสั้น ๆ ใต้ป้ายสถานะในรายการผู้สมัคร */
export function itemNote(it: ApplicantItem, threshold: number): string {
  switch (it.kind) {
    case 'pass': return 'ส่งต่อให้ HR พิจารณา';
    case 'below': return it.score !== null ? `ขาด ${(threshold - it.score).toFixed(1)} คะแนนถึงเกณฑ์` : '';
    case 'gate': return it.gate ? it.gate.replace('Failed: ', '') : '';
    case 'failed': return ''; // ข้อความ error เต็มดูได้จากปุ่ม ⓘ และหน้าสถานะระบบ
    default: return 'กำลังประมวลผล (ปกติ 1–2 นาที)';
  }
}

/** ป้องกัน CSV/Excel Injection: เซลล์ที่ขึ้นต้นด้วย = + - @ จะถูกตีความเป็นสูตร จึงนำหน้าด้วยเครื่องหมาย ' */
export function csvCell(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}

/** สร้างไฟล์ CSV (UTF-8 มี BOM เพื่อให้ Excel อ่านภาษาไทยถูก) แล้วสั่งดาวน์โหลด */
export function downloadCsv(filename: string, rows: unknown[][]): void {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
