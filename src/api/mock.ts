import type { Api } from './api';
import type {
  ApplicationInput,
  AuthorizedUser,
  Candidate,
  CriterionEval,
  EvaluationDetail,
  Job,
  MatchResult,
  Role,
  ScoreBasis,
  SubmitResult,
  SystemConfig,
  SystemLog
} from './types';

/* ------------------------------------------------------------------ */
/* ข้อมูลจำลอง — ชื่อคน/คะแนน เป็นข้อมูลสมมติ ใช้โครงเดียวกับตารางจริง      */
/* ตำแหน่งงาน 3 รายการและค่าเริ่มต้น ตรงกับที่อยู่ใน Supabase ตอนนี้        */
/* ------------------------------------------------------------------ */

interface Store {
  jobs: Job[];
  candidates: Candidate[];
  matches: MatchResult[];
  logs: SystemLog[];
  users: AuthorizedUser[];
  config: SystemConfig;
  nextMatchId: number;
  nextLogId: number;
}

const STORAGE_KEY = 'rs-mock-v1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ev = (items: [string, number][]): CriterionEval[] =>
  items.map(([criterion, confidence]) => ({
    criterion,
    confidence,
    evidence:
      confidence >= 50
        ? `พบหลักฐานใน Resume: [ข้อความตัวอย่างที่เกี่ยวกับ “${criterion}”]`
        : 'ไม่พบข้อมูลที่เกี่ยวข้องใน Resume'
  }));

function seedJobs(): Job[] {
  const base = { preferred_experience_type: null, weight_musthave: 0.35, weight_preferred: 0.15, weight_tool: 0.2, weight_experience: 0.3, match_threshold: 70, is_active: true };
  return [
    { ...base, job_id: 'JOB-AUTO-001', position_name: 'Automation', must_have_skills: ['ใช้ n8n สร้าง Workflow ได้', 'เขียน JavaScript ได้'], preferred_skills: ['เคยใช้ Docker'], required_tools: ['n8n', 'JavaScript'], min_experience_years: 1 },
    { ...base, job_id: 'JOB-FE-001', position_name: 'Frontend', must_have_skills: ['เขียน HTML/CSS ได้', 'ใช้ JavaScript ได้'], preferred_skills: ['เคยใช้ React'], required_tools: ['HTML', 'CSS', 'JavaScript'], min_experience_years: 0 },
    { ...base, job_id: 'JOB-BE-001', position_name: 'Backend', must_have_skills: ['เขียน SQL ได้', 'เข้าใจ API/REST'], preferred_skills: ['เคยใช้ Node.js'], required_tools: ['SQL', 'REST API'], min_experience_years: 0 }
  ];
}

interface Profile {
  id: string;
  name: string;
  pos: string;
  when: string;
  years: number | null;
  form: string | null;
  m: number[];
  p: number[];
  t: number[];
  er: number;
  score: number;
  basis: ScoreBasis;
}

function seed(): Store {
  const jobs = seedJobs();
  const byName = (n: string) => jobs.find((j) => j.position_name === n)!;
  const candidates: Candidate[] = [];
  const matches: MatchResult[] = [];
  let mid = 1;

  const profiles: Profile[] = [
    { id: 'C1968415639', name: 'ปิยะนุช วงศ์ดี', pos: 'Automation', when: '2026-10-19T14:20:00+07:00', years: 3, form: '3-5 ปี', m: [92, 88], p: [50], t: [96, 90], er: 85, score: 86.0, basis: 'Full Assessment (Resume)' },
    { id: 'C1968402718', name: 'ธนกร ศรีสุข', pos: 'Automation', when: '2026-10-19T11:05:00+07:00', years: 1.5, form: null, m: [85, 80], p: [0], t: [90, 85], er: 70, score: 78.4, basis: 'Full Assessment (Resume)' },
    { id: 'C1968377120', name: 'อรอุมา ทองดี', pos: 'Automation', when: '2026-10-18T16:48:00+07:00', years: 0.67, form: null, m: [75, 70], p: [0], t: [60, 85], er: 55, score: 72.3, basis: 'Full Assessment (Resume)' },
    { id: 'C1968351904', name: 'กิตติพงษ์ แก้วมณี', pos: 'Automation', when: '2026-10-18T09:12:00+07:00', years: null, form: '1-3 ปี', m: [80, 60], p: [0], t: [85, 40], er: 40, score: 67.2, basis: 'Partial Assessment (ใช้ช่วงปีจากฟอร์ม)' },
    { id: 'C1968320055', name: 'วรัญญา จันทร์เพ็ญ', pos: 'Automation', when: '2026-10-17T20:31:00+07:00', years: null, form: null, m: [55, 60], p: [0], t: [0, 70], er: 30, score: 54.0, basis: 'ค่ากลาง' },
    { id: 'C1968298833', name: 'สุรเชษฐ์ พูนผล', pos: 'Automation', when: '2026-10-17T13:02:00+07:00', years: 2, form: '1-3 ปี', m: [20, 65], p: [0], t: [10, 70], er: 45, score: 38.5, basis: 'Full Assessment (Resume)' },
    { id: 'C1968261490', name: 'ศุภชัย รักเรียน', pos: 'Backend', when: '2026-10-16T18:40:00+07:00', years: null, form: null, m: [80, 0], p: [0], t: [80, 0], er: 30, score: 41.0, basis: 'ค่ากลาง' }
  ];

  const log = (candidate_id: string | null, status: 'Success' | 'Error', message: string, timestamp: string) => ({
    log_id: 0,
    candidate_id,
    status,
    message,
    timestamp
  });
  const logs: SystemLog[] = [];
  const pushLog = (l: ReturnType<typeof log>) => logs.push({ ...l, log_id: logs.length + 1 });

  for (const p of profiles) {
    const job = byName(p.pos);
    const must = ev(job.must_have_skills.map((s, i) => [s, p.m[i] ?? 0] as [string, number]));
    const pref = ev(job.preferred_skills.map((s, i) => [s, p.p[i] ?? 0] as [string, number]));
    const tool = ev(job.required_tools.map((s, i) => [s, p.t[i] ?? 0] as [string, number]));
    const skills = [...must, ...pref, ...tool].filter((c) => c.confidence >= 50).map((c) => c.criterion);
    const failed = must.find((c) => c.confidence < 50);
    candidates.push({
      candidate_id: p.id,
      full_name: p.name,
      phone_number: '08x-xxx-xxxx',
      email: `${p.id.toLowerCase()}@example.com`,
      applied_position: p.pos,
      self_reported_experience_range: p.form,
      skills,
      experience_years: p.years,
      resume_file_url: '#',
      received_at: p.when,
      application_status: 'In Review',
      processing_status: 'processed',
      processing_error: null
    });
    const detail: EvaluationDetail = {
      must_have_evaluation: must,
      preferred_evaluation: pref,
      tool_evaluation: tool,
      experience_years: p.years,
      experience_relevance: { confidence: p.er, evidence: p.er >= 50 ? 'ประสบการณ์ที่ระบุเกี่ยวข้องกับตำแหน่งนี้โดยตรง' : 'ประสบการณ์ที่ระบุไม่ใช่งานสายนี้โดยตรง' }
    };
    matches.push({
      match_id: mid++,
      candidate_id: p.id,
      job_id: job.job_id,
      match_score: p.score,
      score_basis: p.basis,
      gate_status: failed ? `Failed: ขาด ${failed.criterion}` : 'Pass',
      evaluation_detail: detail,
      evaluated_at: p.when
    });
    pushLog(log(p.id, 'Success', `ประมวลผล Resume สำเร็จ — คะแนน ${p.score.toFixed(1)}${failed ? ` (ไม่ผ่าน Gate: ขาด ${failed.criterion})` : ''}`, p.when));
  }

  // รอประมวลผล / ล้มเหลว
  candidates.push({
    candidate_id: 'C1968285147', full_name: 'มนัสนันท์ รุ่งเรือง', phone_number: '08x-xxx-xxxx', email: 'c1968285147@example.com',
    applied_position: 'Automation', self_reported_experience_range: null, skills: [], experience_years: null,
    resume_file_url: '#', received_at: '2026-10-17T10:40:00+07:00', application_status: 'In Review', processing_status: 'pending', processing_error: null
  });
  candidates.push({
    candidate_id: 'C1968270062', full_name: 'ภาคิน เจริญสุข', phone_number: '08x-xxx-xxxx', email: 'c1968270062@example.com',
    applied_position: 'Automation', self_reported_experience_range: null, skills: [], experience_years: null,
    resume_file_url: '#', received_at: '2026-10-16T22:15:00+07:00', application_status: 'In Review', processing_status: 'failed',
    processing_error: 'Gemini API ไม่ตอบสนอง ลองครบ 5 ครั้งแล้ว'
  });
  pushLog(log('C1968270062', 'Error', 'Gemini API ตอบกลับ 503 — ลองครบ 5 ครั้งแล้ว บันทึกสถานะ failed', '2026-10-16T22:16:00+07:00'));
  pushLog(log(null, 'Error', 'อัปโหลดไฟล์ไป Storage ไม่สำเร็จ', '2026-10-16T18:40:00+07:00'));

  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  logs.forEach((l, i) => (l.log_id = logs.length - i));

  return {
    jobs,
    candidates,
    matches,
    logs,
    users: [
      { email: 'admin@example.com', role: 'Admin', added_at: '2026-10-01T09:00:00+07:00' },
      { email: 'hr@example.com', role: 'HR', added_at: '2026-10-01T09:00:00+07:00' }
    ],
    config: { MAX_RETRY: '3', AI_PROVIDER: 'gemini', NGROK_URL: '' },
    nextMatchId: mid,
    nextLogId: logs.length + 1
  };
}

/* ------------------------------ สถานะ ------------------------------ */

let store: Store = load();

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ใช้ข้อมูลตั้งต้น */
  }
  return seed();
}

function persist() {
  try {
    const copy: Store = {
      ...store,
      candidates: store.candidates.map((c) => (c.resume_file_url.startsWith('blob:') ? { ...c, resume_file_url: '#' } : c))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch {
    /* ไม่มี localStorage ก็ทำงานต่อในหน่วยความจำ */
  }
}

function addLog(candidate_id: string | null, status: 'Success' | 'Error', message: string) {
  store.logs.unshift({ log_id: store.nextLogId++, candidate_id, status, message, timestamp: new Date().toISOString() });
}

/* ------------------------ จำลองการประมวลผลของ AI ------------------------ */
// ใช้เฉพาะโหมดทดลอง: ค่าความมั่นใจมาจาก hash ของอีเมล เพื่อให้ผลคงที่ต่อผู้สมัครคนเดิม
// สูตรคะแนนด้านล่างเป็นสูตรอย่างง่ายสำหรับสาธิต ไม่ใช่ Algorithm v4 จริงใน n8n

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function evaluate(job: Job, c: Candidate): { match: Omit<MatchResult, 'match_id'>; years: number | null; skills: string[] } {
  const h = hash(c.email + c.applied_position);
  const conf = (list: string[], salt: number) =>
    list.map((name, i) => [name, ((h >> ((i + salt) % 24)) % 100)] as [string, number]);
  const must = ev(conf(job.must_have_skills, 0).map(([n, v]) => [n, v < 25 ? 30 + (v % 20) : 55 + (v % 45)]));
  const pref = ev(conf(job.preferred_skills, 5));
  const tool = ev(conf(job.required_tools, 9).map(([n, v]) => [n, 40 + (v % 60)]));
  const years: number | null = h % 3 === 0 ? null : (h % 7) / 2;
  const er = 35 + (h % 60);

  const basis: ScoreBasis = 'Full Assessment (Resume)';
  const tw = job.weight_musthave + job.weight_preferred + job.weight_tool || 1;
  const score =
    (job.weight_musthave * avg(must.map((x) => x.confidence)) +
      job.weight_preferred * avg(pref.map((x) => x.confidence)) +
      job.weight_tool * avg(tool.map((x) => x.confidence))) / tw;
  const failed = must.find((x) => x.confidence < 50);
  const skills = [...must, ...pref, ...tool].filter((x) => x.confidence >= 50).map((x) => x.criterion);
  return {
    years,
    skills,
    match: {
      candidate_id: c.candidate_id,
      job_id: job.job_id,
      match_score: Math.round(score * 10) / 10,
      score_basis: basis,
      gate_status: failed ? `Failed: ขาด ${failed.criterion}` : 'Pass',
      evaluation_detail: {
        must_have_evaluation: must,
        preferred_evaluation: pref,
        tool_evaluation: tool,
        experience_years: years,
        experience_relevance: { confidence: er, evidence: er >= 50 ? 'ประสบการณ์ที่ระบุเกี่ยวข้องกับตำแหน่งนี้' : 'ประสบการณ์ที่ระบุไม่ใช่งานสายนี้โดยตรง' }
      },
      evaluated_at: new Date().toISOString()
    }
  };
}

function processCandidate(candidateId: string) {
  const c = store.candidates.find((x) => x.candidate_id === candidateId);
  if (!c || c.processing_status === 'processed') return;
  const job = store.jobs.find((j) => j.position_name === c.applied_position);
  if (!job) {
    c.processing_status = 'failed';
    c.processing_error = `ไม่พบตำแหน่ง “${c.applied_position}” ในระบบ`;
    addLog(c.candidate_id, 'Error', c.processing_error);
    persist();
    return;
  }
  const r = evaluate(job, c);
  c.processing_status = 'processed';
  c.processing_error = null;
  c.experience_years = r.years;
  c.skills = r.skills;
  store.matches = store.matches.filter((m) => m.candidate_id !== c.candidate_id);
  store.matches.push({ ...r.match, match_id: store.nextMatchId++ });
  addLog(c.candidate_id, 'Success', `ประมวลผล Resume สำเร็จ — คะแนน ${r.match.match_score.toFixed(1)}${r.match.gate_status === 'Pass' ? '' : ` (ไม่ผ่าน Gate: ${r.match.gate_status.replace('Failed: ', '')})`}`);
  persist();
}

// ผู้สมัครที่ค้าง pending (เช่น ปิดหน้าเว็บก่อนประมวลผลเสร็จ) ให้ประมวลผลต่อ
setTimeout(() => store.candidates.filter((c) => c.processing_status === 'pending' && c.candidate_id !== 'C1968285147').forEach((c) => processCandidate(c.candidate_id)), 1500);

/* ------------------------------- API ------------------------------- */

const NET = 220; // หน่วงเวลาเล็กน้อยให้เหมือนเรียกเครือข่ายจริง
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const mockApi: Api = {
  async listOpenPositions() {
    await sleep(NET);
    const now = Date.now();
    return store.jobs
      .filter((j) => j.is_active && (!j.open_at || Date.parse(j.open_at) <= now) && (!j.close_at || Date.parse(j.close_at) >= now))
      .map((j) => ({
        job_id: j.job_id,
        position_name: j.position_name,
        description: j.description ?? null,
        min_experience_years: j.min_experience_years,
        must_have_skills: j.must_have_skills,
        preferred_skills: j.preferred_skills,
        required_tools: j.required_tools,
        close_at: j.close_at ?? null
      }));
  },

  async submitApplication(input: ApplicationInput): Promise<SubmitResult> {
    await sleep(NET * 3);
    const email = input.email.trim().toLowerCase();
    if (!input.full_name.trim() || !input.phone_number.trim() || !email || !input.applied_position) {
      return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }
    if (input.resume.type !== 'application/pdf' && !input.resume.name.toLowerCase().endsWith('.pdf')) {
      return { status: 'error', message: 'ไฟล์ต้องเป็น PDF' };
    }
    const dup = store.candidates.find((c) => c.email.toLowerCase() === email && c.applied_position === input.applied_position);
    if (dup) return { status: 'duplicate', candidate_id: dup.candidate_id };

    const id = 'C' + String(Date.now()).slice(-10);
    store.candidates.unshift({
      candidate_id: id,
      full_name: input.full_name.trim(),
      phone_number: input.phone_number.trim(),
      email,
      applied_position: input.applied_position,
      self_reported_experience_range: input.self_reported_experience_range,
      skills: [],
      experience_years: null,
      resume_file_url: URL.createObjectURL(input.resume),
      received_at: new Date().toISOString(),
      application_status: 'In Review',
      processing_status: 'pending',
      processing_error: null
    });
    addLog(id, 'Success', 'รับใบสมัครแล้ว รอประมวลผล Resume');
    persist();
    setTimeout(() => processCandidate(id), 3500);
    return { status: 'received', candidate_id: id };
  },

  async signIn(email, password) {
    await sleep(NET);
    const u = store.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u || !password) throw new Error('not_authorized');
    return { email: u.email, role: u.role };
  },

  async signInGoogle() {
    throw new Error('โหมดทดลองไม่รองรับ Google จริง');
  },

  async signOut() {
    /* โหมดทดลอง: ไม่มีอะไรต้องล้าง */
  },

  async restoreSession() {
    return null;
  },

  async listJobs() {
    await sleep(NET);
    return clone(store.jobs);
  },

  async saveJob(input) {
    await sleep(NET);
    const sum = input.weight_musthave + input.weight_preferred + input.weight_tool + input.weight_experience;
    if (Math.abs(sum - 1) > 0.0001) throw new Error('น้ำหนักรวมต้องเท่ากับ 100%');
    if (input.job_id) {
      const i = store.jobs.findIndex((j) => j.job_id === input.job_id);
      if (i >= 0) {
        store.jobs[i] = { ...store.jobs[i], ...input, job_id: input.job_id };
        persist();
        return clone(store.jobs[i]);
      }
    }
    const n = store.jobs.length + 1;
    const job: Job = { ...input, job_id: `JOB-NEW-${String(n).padStart(3, '0')}` };
    store.jobs.push(job);
    persist();
    return clone(job);
  },

  async listCandidateRows(jobId) {
    await sleep(NET);
    const job = store.jobs.find((j) => j.job_id === jobId);
    if (!job) return [];
    return store.candidates
      .filter((c) => c.applied_position === job.position_name)
      .sort((a, b) => b.received_at.localeCompare(a.received_at))
      .map((c) => ({
        candidate: clone(c),
        match: clone(store.matches.filter((m) => m.candidate_id === c.candidate_id && m.job_id === jobId).sort((a, b) => b.evaluated_at.localeCompare(a.evaluated_at))[0] ?? null)
      }));
  },

  async getCandidate(candidateId) {
    await sleep(NET);
    const candidate = store.candidates.find((c) => c.candidate_id === candidateId);
    if (!candidate) return null;
    const job = store.jobs.find((j) => j.position_name === candidate.applied_position) ?? null;
    const match = store.matches.filter((m) => m.candidate_id === candidateId).sort((a, b) => b.evaluated_at.localeCompare(a.evaluated_at))[0] ?? null;
    return {
      candidate: clone(candidate),
      match: clone(match),
      job: clone(job),
      logs: clone(store.logs.filter((l) => l.candidate_id === candidateId))
    };
  },

  async setApplicationStatus(candidateId, status) {
    await sleep(NET / 2);
    const c = store.candidates.find((x) => x.candidate_id === candidateId);
    if (c) c.application_status = status;
    persist();
  },

  async getResumeUrl(candidate) {
    return candidate.resume_file_url === '#' ? null : candidate.resume_file_url;
  },

  async updateCandidate(candidateId, patch) {
    await sleep(NET / 2);
    const c = store.candidates.find((x) => x.candidate_id === candidateId);
    if (!c) throw new Error('ไม่พบผู้สมัคร');
    Object.assign(c, patch);
    persist();
  },

  async retryCandidate(candidateId) {
    await sleep(NET * 2);
    const c = store.candidates.find((x) => x.candidate_id === candidateId);
    if (!c) return;
    c.processing_status = 'pending';
    c.processing_error = null;
    processCandidate(candidateId);
  },

  async listLogs() {
    await sleep(NET);
    return clone(store.logs);
  },

  async listFailedCandidates() {
    await sleep(NET);
    return clone(store.candidates.filter((c) => c.processing_status === 'failed'));
  },

  async listUsers() {
    await sleep(NET);
    return clone(store.users);
  },

  async addUser(email, role: Role) {
    await sleep(NET);
    const e = email.trim().toLowerCase();
    if (!e) throw new Error('กรุณากรอกอีเมล');
    if (store.users.some((u) => u.email.toLowerCase() === e)) throw new Error('อีเมลนี้อยู่ในรายการแล้ว');
    store.users.push({ email: e, role, added_at: new Date().toISOString() });
    persist();
  },

  async removeUser(email) {
    await sleep(NET);
    if (store.users.filter((u) => u.role === 'Admin').length === 1 && store.users.find((u) => u.email === email)?.role === 'Admin') {
      throw new Error('ต้องเหลือ Admin อย่างน้อย 1 คน');
    }
    store.users = store.users.filter((u) => u.email !== email);
    persist();
  },

  async getConfig() {
    await sleep(NET);
    return clone(store.config);
  },

  async saveConfig(config) {
    await sleep(NET);
    store.config = clone(config);
    persist();
  },

  async resetDemoData() {
    await sleep(NET);
    store = seed();
    persist();
  }
};
