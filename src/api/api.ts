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
  PersonApplication,
  DateRange,
  PositionStat,
  DashboardSummary,
  DataRequest,
  Interview,
  InterviewInput,
  SystemHealth,
  Calibration
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
  /** สรุปสำหรับ Dashboard: jobId = null คือทุกตำแหน่ง, range = ช่วงวันที่ (เวลาไทย รวมวันสุดท้าย) */
  dashboardSummary(jobId: string | null, range: DateRange): Promise<DashboardSummary>;
  /** รายชื่อผู้สมัครของตำแหน่งหนึ่ง กรอง/เรียง/แบ่งหน้าที่ฝั่งเซิร์ฟเวอร์ */
  listApplicants(query: ApplicantQuery): Promise<ApplicantPage>;
  /** ค้นหาผู้สมัครข้ามทุกตำแหน่ง (ชื่อ/อีเมล/เบอร์/รหัส อย่างน้อย 2 ตัวอักษร) คืนทุกใบสมัครของคนที่ตรง */
  searchApplicants(query: string): Promise<PersonApplication[]>;
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
  /** เปลี่ยนสถานะหลายคนพร้อมกัน (สูงสุด 200) คืนจำนวนที่เปลี่ยนจริง */
  setApplicationStatusMany(candidateIds: string[], status: string, notify?: boolean): Promise<number>;
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

  // คำขอลบข้อมูลตาม PDPA
  /** ผู้สมัครส่งคำขอ (สาธารณะ) ตอบสำเร็จเสมอ ไม่บอกว่าอีเมลนี้เคยสมัครหรือไม่ */
  submitDataRequest(input: { email: string; name?: string; note?: string }): Promise<void>;
  listDataRequests(): Promise<DataRequest[]>;
  /** ลบทุกใบสมัครของอีเมลในคำขอ (รวมไฟล์ Resume) คืนจำนวนใบสมัครที่ลบ */
  fulfillDataRequest(id: number): Promise<number>;
  rejectDataRequest(id: number): Promise<void>;
  getInterview(candidateId: string): Promise<Interview | null>;
  scheduleInterview(candidateId: string, input: InterviewInput, notify: boolean): Promise<void>;
  cancelInterview(id: number, notify: boolean): Promise<void>;

  // สุขภาพระบบและการตรวจเทียบ (HR/Admin)
  systemHealth(): Promise<SystemHealth>;
  /** HR แจ้งปัญหาให้ Admin (บันทึกในประวัติการใช้งาน) candidateId ว่างได้ถ้าเป็นปัญหาทั่วไป */
  reportIssue(candidateId: string | null, message: string): Promise<void>;
  /** อีเมลของ Admin ทั้งหมด ใช้เปิดอีเมลแจ้งปัญหา */
  adminContacts(): Promise<string[]>;
  calibrationSummary(jobId: string | null): Promise<Calibration>;

  // ผู้ใช้และการตั้งค่า (Admin)
  listUsers(): Promise<AuthorizedUser[]>;
  addUser(email: string, role: Role): Promise<void>;
  removeUser(email: string): Promise<void>;
  getConfig(): Promise<SystemConfig>;
  saveConfig(config: SystemConfig): Promise<void>;

  // เฉพาะโหมดทดลอง
  resetDemoData(): Promise<void>;
}
