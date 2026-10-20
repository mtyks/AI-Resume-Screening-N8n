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
  // คอลัมน์เดิม ไม่ได้ใช้คิดคะแนนและไม่แสดงในหน้าเว็บแล้ว (เก็บไว้เพื่อไม่ให้ข้อมูลเดิมหาย)
  preferred_experience_type?: string | null;
  // น้ำหนักเก็บเป็นทศนิยม 0–1 เหมือนในฐานข้อมูล (UI แสดงเป็นเปอร์เซ็นต์)
  weight_musthave: number;
  weight_preferred: number;
  weight_tool: number;
  // คอลัมน์เดิม: ประสบการณ์ไม่ถูกนำมาคิดคะแนนแล้ว จึงตั้งเป็น 0 เสมอ
  weight_experience: number;
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

// วิธีคิดคะแนนมีแบบเดียว (ทักษะ+เครื่องมือ จาก Resume) คอลัมน์ score_basis ใน DB จึงเป็นค่าคงที่
export type ScoreBasis = 'Full Assessment (Resume)';

export interface MatchResult {
  match_id: number;
  candidate_id: string;
  job_id: string;
  match_score: number;
  score_basis: ScoreBasis;
  gate_status: string; // 'Pass' หรือ 'Failed: ขาด <ทักษะ>'
  evaluation_detail: EvaluationDetail;
  evaluated_at: string;
}

export type LogStatus = 'Success' | 'Error';

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
}

export type SubmitResult =
  | { status: 'received'; candidate_id: string }
  | { status: 'duplicate'; candidate_id: string }
  | { status: 'error'; message: string };

export type CandidatePatch = Partial<Pick<Candidate, 'full_name' | 'phone_number' | 'email' | 'self_reported_experience_range'>>;
