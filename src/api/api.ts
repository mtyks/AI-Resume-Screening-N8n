import type {
  ApplicationInput,
  AuditEntry,
  AuthorizedUser,
  Job,
  MatchResult,
  Role,
  SubmitResult,
  SystemConfig,
  SystemLog,
  Candidate,
  OpenPosition,
  CandidatePatch,
  ApplicantQuery,
  ApplicantPage,
  PositionStat,
  DashboardSummary
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
  /** สถิติรายตำแหน่ง (จำนวน ยังไม่อ่าน ผ่านเกณฑ์ ฯลฯ) */
  positionStats(): Promise<PositionStat[]>;
  /** สรุปสำหรับ Dashboard: jobId = null คือทุกตำแหน่ง, days = ช่วงย้อนหลัง (วัน) */
  dashboardSummary(jobId: string | null, days: number): Promise<DashboardSummary>;
  /** รายชื่อผู้สมัครของตำแหน่งหนึ่ง กรอง/เรียง/แบ่งหน้าที่ฝั่งเซิร์ฟเวอร์ */
  listApplicants(query: ApplicantQuery): Promise<ApplicantPage>;
  /** ทำเครื่องหมายอ่านแล้ว/ยังไม่อ่าน (หลายคนพร้อมกันได้) */
  setRead(candidateIds: string[], read: boolean): Promise<void>;
  setStarred(candidateId: string, starred: boolean): Promise<void>;
  saveNote(candidateId: string, note: string): Promise<void>;
  /** จำนวนผู้สมัครที่ปุ่ม "ลบที่อ่านแล้ว" จะลบ (อ่านแล้ว ไม่ติดดาว ไม่ใช่ Hired) */
  countDeletableRead(jobId: string): Promise<number>;
  /** ลบผู้สมัครที่อ่านแล้วของตำแหน่งนี้ถาวร (รวมไฟล์ Resume) คืนจำนวนที่ลบ */
  deleteReadCandidates(jobId: string): Promise<number>;
  getCandidate(candidateId: string): Promise<{ candidate: Candidate; match: MatchResult | null; job: Job | null; logs: SystemLog[] } | null>;
  /** เปลี่ยนสถานะการพิจารณา; notify=true จะส่งอีเมลแจ้งผู้สมัครอัตโนมัติ คืน queued=true ถ้าเข้าคิวส่งอีเมลแล้ว */
  setApplicationStatus(candidateId: string, status: string, notify?: boolean): Promise<{ changed: boolean; queued: boolean }>;
  /** จำนวนผู้สมัครที่ค้างรอประมวลผลนานผิดปกติ (n8n อาจหยุดทำงาน) */
  pipelineHealth(): Promise<{ stuck: number; oldest_minutes: number }>;
  retryCandidate(candidateId: string): Promise<void>;
  /** ลิงก์ชั่วคราวสำหรับเปิดไฟล์ Resume (bucket เป็น private) */
  /** สแกนซ้ำหลายคน (ทุกสถานะ) คืนจำนวนที่ส่งเข้าคิว */
  retryMany(candidateIds: string[]): Promise<number>;
  getResumeUrl(candidate: Candidate): Promise<string | null>;
  /** Admin แก้ข้อมูลติดต่อและช่วงประสบการณ์ของผู้สมัคร */
  updateCandidate(candidateId: string, patch: CandidatePatch): Promise<void>;

  // Log
  listLogs(): Promise<SystemLog[]>;
  listFailedCandidates(): Promise<Candidate[]>;
  /** ประวัติการใช้งานของ HR/Admin (เฉพาะ Admin) */
  listAudit(): Promise<AuditEntry[]>;
  /** บันทึกว่ามีการส่งออก CSV (ชื่อตำแหน่งและจำนวนแถว) */
  logExport(target: string, rows: number): Promise<void>;

  // ผู้ใช้และการตั้งค่า (Admin)
  listUsers(): Promise<AuthorizedUser[]>;
  addUser(email: string, role: Role): Promise<void>;
  removeUser(email: string): Promise<void>;
  getConfig(): Promise<SystemConfig>;
  saveConfig(config: SystemConfig): Promise<void>;

  // เฉพาะโหมดทดลอง
  resetDemoData(): Promise<void>;
}
