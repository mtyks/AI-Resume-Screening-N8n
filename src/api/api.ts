import type {
  ApplicationInput,
  AuthorizedUser,
  CandidateRow,
  Job,
  MatchResult,
  Role,
  SubmitResult,
  SystemConfig,
  SystemLog,
  Candidate,
  OpenPosition,
  CandidatePatch
} from './types';

/**
 * สัญญาของชั้นข้อมูล — ทุกหน้าเรียกผ่าน interface นี้เท่านั้น
 * ตอนนี้ implement ด้วยข้อมูลจำลอง (mock.ts)
 * เมื่อจะเชื่อม Supabase ให้เขียน supabaseApi.ts ที่ implement interface เดียวกัน
 * แล้วสลับ export ใน src/api/index.ts จุดเดียว ไม่ต้องแก้หน้าจอ
 */
export interface Api {
  // ผู้สมัคร (สาธารณะ)
  listOpenPositions(): Promise<OpenPosition[]>;
  submitApplication(input: ApplicationInput): Promise<SubmitResult>;

  // เข้าสู่ระบบ
  signIn(email: string, password: string): Promise<{ email: string; role: Role }>;
  signInGoogle(remember?: boolean): Promise<void>;
  signOut(): Promise<void>;
  restoreSession(): Promise<{ email: string; role: Role } | null>;

  // ตำแหน่งงาน
  listJobs(): Promise<Job[]>;
  saveJob(job: Omit<Job, 'job_id'> & { job_id?: string }): Promise<Job>;

  // ผู้สมัครและผลจับคู่
  listCandidateRows(jobId: string): Promise<CandidateRow[]>;
  getCandidate(candidateId: string): Promise<{ candidate: Candidate; match: MatchResult | null; job: Job | null; logs: SystemLog[] } | null>;
  setApplicationStatus(candidateId: string, status: string): Promise<void>;
  retryCandidate(candidateId: string): Promise<void>;
  /** ลิงก์ชั่วคราวสำหรับเปิดไฟล์ Resume (bucket เป็น private) */
  getResumeUrl(candidate: Candidate): Promise<string | null>;
  /** Admin แก้ข้อมูลติดต่อและช่วงประสบการณ์ของผู้สมัคร */
  updateCandidate(candidateId: string, patch: CandidatePatch): Promise<void>;

  // Log
  listLogs(): Promise<SystemLog[]>;
  listFailedCandidates(): Promise<Candidate[]>;

  // ผู้ใช้และการตั้งค่า (Admin)
  listUsers(): Promise<AuthorizedUser[]>;
  addUser(email: string, role: Role): Promise<void>;
  removeUser(email: string): Promise<void>;
  getConfig(): Promise<SystemConfig>;
  saveConfig(config: SystemConfig): Promise<void>;

  // เฉพาะโหมดทดลอง
  resetDemoData(): Promise<void>;
}
