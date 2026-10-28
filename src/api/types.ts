// ชนิดข้อมูลตรงกับตารางจริงใน Supabase (ชื่อคอลัมน์เหมือนกันทุกตัว)
// เมื่อเชื่อมฐานข้อมูลจริง ชนิดเหล่านี้ใช้ต่อได้เลย

export type Role = 'HR' | 'Admin';

export interface Job {
  job_id: string;
  position_name: string;
  must_have_skills: string[];
  preferred_skills: string[];
  required_tools: string[];
  min_experience_years: number;
  // น้ำหนักเก็บเป็นทศนิยม 0–1 เหมือนในฐานข้อมูล (UI แสดงเป็นเปอร์เซ็นต์)
  weight_musthave: number;
  weight_preferred: number;
  weight_tool: number;
  match_threshold: number;
  is_active: boolean;
  // ช่วงเปิดรับสมัคร (ว่าง = ไม่จำกัด) และคำอธิบายตำแหน่งที่ผู้สมัครเห็น
  open_at?: string | null;
  close_at?: string | null;
  description?: string | null;
}

// ตำแหน่งที่เปิดรับอยู่ตอนนี้ (ข้อมูลที่ผู้สมัครเห็นได้)
export interface OpenPosition {
  job_id: string;
  position_name: string;
  description: string | null;
  min_experience_years: number;
  must_have_skills: string[];
  preferred_skills: string[];
  required_tools: string[];
  close_at: string | null;
}

export type ProcessingStatus = 'pending' | 'processed' | 'failed';

export interface Candidate {
  candidate_id: string;
  full_name: string;
  phone_number: string;
  email: string;
  applied_position: string;
  self_reported_experience_range: string | null;
  skills: string[]; // ทักษะที่ AI พบ (confidence ≥ 50) เขียนโดย workflow
  resume_file_url: string;
  received_at: string;
  application_status: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  // งานของ HR (ตั้งโดยหน้าเว็บ ไม่ใช่ workflow)
  is_read: boolean; // HR เปิดดูแล้วหรือยัง
  starred: boolean; // ติดดาว/shortlist
  hr_note: string | null;
  hr_note_at?: string | null;
  hr_note_by?: string | null;
  /** ช่องทางที่ผู้สมัครทราบข่าว (ผู้สมัครเลือกเอง หรือมาจากลิงก์ ?src=) */
  source?: string | null;
}

export interface CriterionEval {
  criterion: string;
  confidence: number;
  evidence: string;
}

export interface EvaluationDetail {
  must_have_evaluation: CriterionEval[];
  preferred_evaluation: CriterionEval[];
  tool_evaluation: CriterionEval[];
}

export interface MatchResult {
  match_id: number;
  candidate_id: string;
  job_id: string;
  match_score: number;
  gate_status: string; // 'Pass' หรือ 'Failed: ขาด <ทักษะ>'
  evaluation_detail: EvaluationDetail;
  evaluated_at: string;
}

export type LogStatus = 'Success' | 'Error';

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
}

export interface SystemLog {
  log_id: number;
  candidate_id: string | null;
  status: LogStatus;
  message: string;
  timestamp: string;
}

export interface AuthorizedUser {
  email: string;
  role: Role;
  added_at: string;
}

// ค่าตั้งระบบที่หน้าเว็บแก้ได้ (ตาราง system_config) — มีค่าเดียวคือ AI ที่ใช้
export interface SystemConfig {
  AI_PROVIDER: string; // 'gemini' = คีย์หลัก, 'gemini_backup' = คีย์สำรอง
}

export interface CandidateRow {
  candidate: Candidate;
  match: MatchResult | null;
}

export interface ApplicationInput {
  full_name: string;
  phone_number: string;
  email: string;
  applied_position: string;
  self_reported_experience_range: string | null;
  resume: File;
  /** โทเคนจาก Cloudflare Turnstile (มีเมื่อตั้งค่า VITE_TURNSTILE_SITE_KEY) */
  turnstileToken?: string;
  /** ช่องทางที่ทราบข่าวการรับสมัคร (ไม่บังคับ) */
  source?: string;
}

export type SubmitResult =
  | { status: 'received'; candidate_id: string }
  | { status: 'duplicate'; candidate_id: string }
  | { status: 'error'; message: string };

export type CandidatePatch = Partial<Pick<Candidate, 'full_name' | 'phone_number' | 'email' | 'self_reported_experience_range'>>;

/** ผลสรุปของผู้สมัครหนึ่งคนในรายการ (ผลจับคู่ล่าสุดของตำแหน่งนั้น) */
export type ApplicantKind = 'pass' | 'below' | 'gate' | 'pending' | 'failed';

export interface ApplicantItem {
  candidate: Candidate;
  score: number | null;
  gate: string | null;
  kind: ApplicantKind;
}

export type ApplicantSort = 'score' | 'recent' | 'name' | 'unread';

/** เงื่อนไขค้นหารายชื่อผู้สมัครของตำแหน่งหนึ่ง (กรอง เรียง แบ่งหน้าที่ฝั่งฐานข้อมูล) */
export interface ApplicantQuery {
  jobId: string;
  q?: string;
  kind?: 'all' | ApplicantKind;
  appStatus?: string; // '' = ทุกสถานะ
  unread?: boolean;
  starred?: boolean;
  sort?: ApplicantSort;
  page: number; // เริ่มที่ 1
  pageSize: number;
}

export interface ApplicantPage {
  items: ApplicantItem[];
  total: number;
}

/** สถิติต่อตำแหน่ง (ใช้ในหน้าภาพรวม หน้าเลือกตำแหน่ง และแจ้งเตือน) */
export interface PositionStat {
  job_id: string;
  position_name: string;
  is_active: boolean;
  match_threshold: number;
  close_at: string | null;
  total: number;
  unread: number;
  starred: number;
  pending: number;
  failed: number;
  passed: number;
  below: number;
  gate: number;
  hired: number;
  avg_score: number | null;
  buckets: number[]; // 10 ช่วงคะแนน 0-9, 10-19, … 90-100
}

/** สรุปข้อมูลหน้า Dashboard ตามตำแหน่งและช่วงเวลา (ฟังก์ชัน dashboard_summary) */
export interface DashboardSummary {
  days: number;
  active_openings: number;
  total: number;
  prev_total: number;
  avg_score: number | null;
  prev_avg_score: number | null;
  /** เวลามัธยฐานตั้งแต่ใบสมัครเข้าระบบจนสแกนเสร็จครั้งแรก (นาที) */
  median_minutes: number | null;
  funnel: { applied: number; scanned: number; passed: number; interview: number; offer: number; hired: number; rejected: number };
  sources: { name: string; n: number }[];
  inflow: { d: string; n: number }[];
  skills: { name: string; n: number }[];
  buckets: number[];
}
