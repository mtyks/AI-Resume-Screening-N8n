import type { Api } from './api';
import type {
  AuditEntry,
  ApplicantItem,
  ApplicantKind,
  ApplicantPage,
  ApplicationInput,
  AuthorizedUser,
  Candidate,
  CriterionEval,
  EvaluationDetail,
  Job,
  MatchResult,
  PositionStat,
  Role,
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

const STORAGE_KEY = 'rs-mock-v3';
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
  const base = { weight_musthave: 0.5, weight_preferred: 0.2, weight_tool: 0.3, match_threshold: 70, is_active: true };
  return [
    { ...base, job_id: 'JOB-AUTO-001', position_name: 'Automation', must_have_skills: ['ใช้ n8n สร้าง Workflow ได้', 'เขียน JavaScript ได้'], preferred_skills: ['เคยใช้ Docker'], required_tools: ['n8n', 'JavaScript'], min_experience_years: 1 },
    { ...base, job_id: 'JOB-FE-001', position_name: 'Frontend', must_have_skills: ['เขียน HTML/CSS ได้', 'ใช้ JavaScript ได้'], preferred_skills: ['เคยใช้ React'], required_tools: ['HTML', 'CSS', 'JavaScript'], min_experience_years: 0 },
    { ...base, job_id: 'JOB-BE-001', position_name: 'Backend', must_have_skills: ['เขียน SQL ได้', 'เข้าใจ API/REST'], preferred_skills: ['เคยใช้ Node.js'], required_tools: ['SQL', 'REST API'], min_experience_years: 0 },
    // ตำแหน่งตัวอย่างเพิ่มเติม (ให้โหมดทดลองเห็นหน้าสมัครเมื่อมีตำแหน่งเปิดรับเยอะ)
    ...([
      ['JOB-UX-001', 'UX/UI Designer', 0, ['ออกแบบ Wireframe และ Prototype ได้', 'เข้าใจหลัก UX'], ['เคยทดสอบกับผู้ใช้จริง'], ['Figma', 'Adobe XD']],
      ['JOB-DA-001', 'Data Analyst', 1, ['เขียน SQL ได้', 'สรุปข้อค้นพบจากข้อมูลได้'], ['เขียน Python ได้'], ['Power BI', 'Excel']],
      ['JOB-QA-001', 'QA Tester', 0, ['เขียน Test Case ได้', 'รายงาน Bug ได้ชัดเจน'], ['เขียน Automated Test ได้'], ['Postman', 'Jira']],
      ['JOB-DEVOPS-001', 'DevOps Engineer', 2, ['ใช้ Linux ได้', 'ตั้งค่า CI/CD ได้'], ['เคยใช้ Kubernetes'], ['Docker', 'GitHub Actions']],
      ['JOB-MOB-001', 'Mobile Developer', 1, ['พัฒนาแอปมือถือได้', 'เรียกใช้ REST API ได้'], ['เคยปล่อยแอปขึ้น Store'], ['Flutter', 'Firebase']],
      ['JOB-FS-001', 'Full-Stack Developer', 2, ['เขียน JavaScript/TypeScript ได้', 'ออกแบบฐานข้อมูลได้'], ['เคย deploy ขึ้น Cloud'], ['React', 'Node.js', 'PostgreSQL']],
      ['JOB-BA-001', 'Business Analyst', 1, ['เก็บและเขียน Requirement ได้', 'วาด Flowchart ได้'], ['เขียน User Story'], ['Jira', 'Draw.io']],
      ['JOB-SEC-001', 'Cybersecurity Analyst', 2, ['เข้าใจ OWASP Top 10', 'วิเคราะห์ Log ได้'], ['เคยทำ Penetration Test'], ['Wireshark', 'Nmap']],
      ['JOB-RPA-001', 'RPA Developer', 0, ['พัฒนา Workflow ด้วย UiPath ได้', 'วิเคราะห์กระบวนการได้'], ['เคยใช้ Orchestrator'], ['UiPath', 'Excel']],
      ['JOB-IT-001', 'IT Support', 0, ['แก้ปัญหา Windows ได้', 'เข้าใจพื้นฐานเครือข่าย'], ['เคยใช้ Active Directory'], ['Windows', 'Microsoft 365']]
    ] as [string, string, number, string[], string[], string[]][]).map(([job_id, position_name, min_experience_years, must_have_skills, preferred_skills, required_tools]): Job =>
      ({ ...base, job_id, position_name, must_have_skills, preferred_skills, required_tools, min_experience_years }))
  ];
}

interface Profile {
  id: string;
  name: string;
  pos: string;
  when: string;
  form: string | null;
  m: number[];
  p: number[];
  t: number[];
  score: number;
  read?: boolean;
}

function seed(): Store {
  const jobs = seedJobs();
  const byName = (n: string) => jobs.find((j) => j.position_name === n)!;
  const candidates: Candidate[] = [];
  const matches: MatchResult[] = [];
  let mid = 1;

  const profiles: Profile[] = [
    { id: 'C1968415639', name: 'ปิยะนุช วงศ์ดี', pos: 'Automation', when: '2026-10-19T14:20:00+07:00', form: '3-5 ปี', m: [92, 88], p: [50], t: [96, 90], score: 86.0, read: true },
    { id: 'C1968402718', name: 'ธนกร ศรีสุข', pos: 'Automation', when: '2026-10-19T11:05:00+07:00', form: null, m: [85, 80], p: [0], t: [90, 85], score: 78.4, read: true },
    { id: 'C1968377120', name: 'อรอุมา ทองดี', pos: 'Automation', when: '2026-10-18T16:48:00+07:00', form: null, m: [75, 70], p: [0], t: [60, 85], score: 72.3 },
    { id: 'C1968351904', name: 'กิตติพงษ์ แก้วมณี', pos: 'Automation', when: '2026-10-18T09:12:00+07:00', form: '1-3 ปี', m: [80, 60], p: [0], t: [85, 40], score: 67.2 },
    { id: 'C1968320055', name: 'วรัญญา จันทร์เพ็ญ', pos: 'Automation', when: '2026-10-17T20:31:00+07:00', form: null, m: [55, 60], p: [0], t: [0, 70], score: 54.0 },
    { id: 'C1968298833', name: 'สุรเชษฐ์ พูนผล', pos: 'Automation', when: '2026-10-17T13:02:00+07:00', form: '1-3 ปี', m: [20, 65], p: [0], t: [10, 70], score: 38.5 },
    { id: 'C1968261490', name: 'ศุภชัย รักเรียน', pos: 'Backend', when: '2026-10-16T18:40:00+07:00', form: null, m: [80, 0], p: [0], t: [80, 0], score: 41.0 }
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
      resume_file_url: '#',
      received_at: p.when,
      application_status: 'In Review',
      processing_status: 'processed',
      processing_error: null,
      is_read: p.read ?? false, starred: false, hr_note: null
    });
    const detail: EvaluationDetail = {
      must_have_evaluation: must,
      preferred_evaluation: pref,
      tool_evaluation: tool,
    };
    matches.push({
      match_id: mid++,
      candidate_id: p.id,
      job_id: job.job_id,
      match_score: p.score,
      gate_status: failed ? `Failed: ขาด ${failed.criterion}` : 'Pass',
      evaluation_detail: detail,
      evaluated_at: p.when
    });
    pushLog(log(p.id, 'Success', `ประมวลผล Resume สำเร็จ — คะแนน ${p.score.toFixed(1)}${failed ? ` (ไม่ผ่าน Gate: ขาด ${failed.criterion})` : ''}`, p.when));
  }

  // รอประมวลผล / ล้มเหลว
  candidates.push({
    candidate_id: 'C1968285147', full_name: 'มนัสนันท์ รุ่งเรือง', phone_number: '08x-xxx-xxxx', email: 'c1968285147@example.com',
    applied_position: 'Automation', self_reported_experience_range: null, skills: [],
    resume_file_url: '#', received_at: '2026-10-17T10:40:00+07:00', application_status: 'In Review', processing_status: 'pending', processing_error: null,
    is_read: false, starred: false, hr_note: null
  });
  candidates.push({
    candidate_id: 'C1968270062', full_name: 'ภาคิน เจริญสุข', phone_number: '08x-xxx-xxxx', email: 'c1968270062@example.com',
    applied_position: 'Automation', self_reported_experience_range: null, skills: [],
    resume_file_url: '#', received_at: '2026-10-16T22:15:00+07:00', application_status: 'In Review', processing_status: 'failed',
    processing_error: 'Gemini API ไม่ตอบสนอง ลองครบ 5 ครั้งแล้ว',
    is_read: false, starred: false, hr_note: null
  });
  pushLog(log('C1968270062', 'Error', 'Gemini API ตอบกลับ 503 — ลองครบ 5 ครั้งแล้ว บันทึกสถานะ failed', '2026-10-16T22:16:00+07:00'));
  pushLog(log(null, 'Error', 'อัปโหลดไฟล์ไป Storage ไม่สำเร็จ', '2026-10-16T18:40:00+07:00'));


  // ผู้สมัครตัวอย่างจำนวนมาก (ให้เห็นการแบ่งหน้า ค้นหา และแจ้งเตือนจำนวนที่ยังไม่อ่าน)
  const first = ['สมชาย', 'สมหญิง', 'ณัฐพล', 'พิมพ์ชนก', 'อภิสิทธิ์', 'กัญญารัตน์', 'ชยพล', 'ธัญญ์สิริ', 'วีระ', 'นภัสสร', 'ปรเมศวร์', 'ลลิตา'];
  const last = ['ใจดี', 'รักงาน', 'มั่นคง', 'สุขสันต์', 'เจริญผล', 'พัฒนา', 'ศรีทอง', 'แสงจันทร์', 'บุญมี', 'วงศ์ไทย'];
  const spread: [string, number][] = [['Automation', 46], ['Frontend', 9], ['Backend', 7]];
  let seq = 0;
  for (const [posName, count] of spread) {
    const job = byName(posName);
    for (let i = 0; i < count; i++, seq++) {
      const id = `CD${String(1000 + seq)}`;
      const when = new Date(Date.parse('2026-10-16T09:00:00+07:00') - seq * 5400_000).toISOString();
      const cand: Candidate = {
        candidate_id: id,
        full_name: `${first[seq % first.length]} ${last[(seq * 7) % last.length]}`,
        phone_number: '08x-xxx-xxxx', email: `demo${seq}@example.com`, applied_position: posName,
        self_reported_experience_range: ['ไม่มีประสบการณ์ (นักศึกษาจบใหม่)', '1-3 ปี', '3-5 ปี', 'มากกว่า 5 ปี'][seq % 4],
        skills: [], resume_file_url: '#', received_at: when, application_status: seq % 17 === 0 ? 'Hired' : 'In Review',
        processing_status: 'processed', processing_error: null,
        is_read: seq % 3 === 0, starred: seq % 11 === 0, hr_note: seq % 11 === 0 ? 'น่าสนใจ นัดสัมภาษณ์รอบแรก' : null
      };
      const r = evaluate(job, cand);
      cand.skills = r.skills;
      candidates.push(cand);
      matches.push({ ...r.match, match_id: mid++, evaluated_at: when });
    }
  }

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
    config: { AI_PROVIDER: 'gemini' },
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

function evaluate(job: Job, c: Candidate): { match: Omit<MatchResult, 'match_id'>; skills: string[] } {
  const h = hash(c.email + c.applied_position);
  const conf = (list: string[], salt: number) =>
    list.map((name, i) => [name, ((h >> ((i + salt) % 24)) % 100)] as [string, number]);
  const must = ev(conf(job.must_have_skills, 0).map(([n, v]) => [n, v < 25 ? 30 + (v % 20) : 55 + (v % 45)]));
  const pref = ev(conf(job.preferred_skills, 5));
  const tool = ev(conf(job.required_tools, 9).map(([n, v]) => [n, 40 + (v % 60)]));
  const tw = job.weight_musthave + job.weight_preferred + job.weight_tool || 1;
  const score =
    (job.weight_musthave * avg(must.map((x) => x.confidence)) +
      job.weight_preferred * avg(pref.map((x) => x.confidence)) +
      job.weight_tool * avg(tool.map((x) => x.confidence))) / tw;
  const failed = must.find((x) => x.confidence < 50);
  const skills = [...must, ...pref, ...tool].filter((x) => x.confidence >= 50).map((x) => x.criterion);
  return {
    skills,
    match: {
      candidate_id: c.candidate_id,
      job_id: job.job_id,
      match_score: Math.round(score * 10) / 10,
      gate_status: failed ? `Failed: ขาด ${failed.criterion}` : 'Pass',
      evaluation_detail: {
        must_have_evaluation: must,
        preferred_evaluation: pref,
        tool_evaluation: tool,
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
  c.skills = r.skills;
  store.matches = store.matches.filter((m) => m.candidate_id !== c.candidate_id);
  store.matches.push({ ...r.match, match_id: store.nextMatchId++ });
  addLog(c.candidate_id, 'Success', `ประมวลผล Resume สำเร็จ — คะแนน ${r.match.match_score.toFixed(1)}${r.match.gate_status === 'Pass' ? '' : ` (ไม่ผ่าน Gate: ${r.match.gate_status.replace('Failed: ', '')})`}`);
  persist();
}

// ผู้สมัครที่ค้าง pending (เช่น ปิดหน้าเว็บก่อนประมวลผลเสร็จ) ให้ประมวลผลต่อ
setTimeout(() => store.candidates.filter((c) => c.processing_status === 'pending' && c.candidate_id !== 'C1968285147').forEach((c) => processCandidate(c.candidate_id)), 1500);


/* ------------------------ ตัวช่วยของหน้าผู้สมัครรายตำแหน่ง ------------------------ */

/** อ่านแล้ว + ไม่ติดดาว + ไม่ใช่ Hired = ถูกลบโดยปุ่ม "ลบที่อ่านแล้ว" (กติกาเดียวกับฟังก์ชันในฐานข้อมูล) */
function deletable(c: Candidate, positionName: string): boolean {
  return c.applied_position === positionName && c.is_read && !c.starred && c.application_status !== 'Hired';
}

/** ผู้สมัครทั้งหมดของตำแหน่งพร้อมคะแนนล่าสุดและประเภทผล (กติกาเดียวกับ list_position_applicants) */
function allApplicants(job: Job): ApplicantItem[] {
  return store.candidates
    .filter((c) => c.applied_position === job.position_name)
    .map((c): ApplicantItem => {
      const m = store.matches.filter((x) => x.candidate_id === c.candidate_id && x.job_id === job.job_id).sort((a, b) => b.evaluated_at.localeCompare(a.evaluated_at))[0] ?? null;
      let kind: ApplicantKind;
      if (c.processing_status === 'failed') kind = 'failed';
      else if (c.processing_status === 'pending' || !m) kind = 'pending';
      else if (m.gate_status !== 'Pass') kind = 'gate';
      else kind = m.match_score >= job.match_threshold ? 'pass' : 'below';
      return { candidate: c, score: m?.match_score ?? null, gate: m?.gate_status ?? null, kind };
    });
}

/* ------------------------------- API ------------------------------- */

const auditLocal: AuditEntry[] = [
  { id: 3, at: new Date(Date.now() - 3600e3).toISOString(), actor: 'hr@example.com', action: 'status_change', target: 'C10000001', detail: { from: 'In Review', to: 'Hired' } },
  { id: 2, at: new Date(Date.now() - 7200e3).toISOString(), actor: 'hr@example.com', action: 'export_csv', target: 'Automation Developer', detail: { rows: 46 } },
  { id: 1, at: new Date(Date.now() - 86400e3).toISOString(), actor: 'ระบบอัตโนมัติ', action: 'candidate_removed', target: 'C10000002', detail: null }
];
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
      resume_file_url: URL.createObjectURL(input.resume),
      received_at: new Date().toISOString(),
      application_status: 'In Review',
      processing_status: 'pending',
      processing_error: null,
      is_read: false,
      starred: false,
      hr_note: null
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
    const sum = input.weight_musthave + input.weight_preferred + input.weight_tool;
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

  async positionStats() {
    await sleep(NET);
    return store.jobs.map((j): PositionStat => {
      const items = allApplicants(j);
      const k = (x: ApplicantKind) => items.filter((i) => i.kind === x).length;
      const scored = items.filter((i) => i.score !== null && ['pass', 'below', 'gate'].includes(i.kind)).map((i) => i.score as number);
      const buckets = Array.from({ length: 10 }, (_, b) => items.filter((i) => i.score !== null && (b === 9 ? i.score >= 90 : i.score >= b * 10 && i.score < (b + 1) * 10)).length);
      return {
        job_id: j.job_id, position_name: j.position_name, is_active: j.is_active, match_threshold: j.match_threshold, close_at: j.close_at ?? null,
        total: items.length, unread: items.filter((i) => !i.candidate.is_read).length, starred: items.filter((i) => i.candidate.starred).length,
        pending: k('pending'), failed: k('failed'), passed: k('pass'), below: k('below'), gate: k('gate'),
        hired: items.filter((i) => i.candidate.application_status === 'Hired').length,
        avg_score: scored.length ? Math.round((scored.reduce((x, y) => x + y, 0) / scored.length) * 10) / 10 : null,
        buckets
      };
    });
  },

  async listApplicants(q): Promise<ApplicantPage> {
    await sleep(NET);
    const job = store.jobs.find((j) => j.job_id === q.jobId);
    if (!job) return { items: [], total: 0 };
    const text = (q.q ?? '').trim().toLowerCase();
    const sort = q.sort ?? 'score';
    const items = allApplicants(job)
      .filter((i) => !text || [i.candidate.full_name, i.candidate.email, i.candidate.candidate_id].some((v) => v.toLowerCase().includes(text)))
      .filter((i) => !q.appStatus || i.candidate.application_status === q.appStatus)
      .filter((i) => !q.unread || !i.candidate.is_read)
      .filter((i) => !q.starred || i.candidate.starred)
      .filter((i) => !q.kind || q.kind === 'all' || i.kind === q.kind)
      .sort((a, b) => {
        if (sort === 'score') { const d = (b.score ?? -1) - (a.score ?? -1); if (d) return d; }
        if (sort === 'name') { const d = a.candidate.full_name.localeCompare(b.candidate.full_name, 'th'); if (d) return d; }
        if (sort === 'unread') { const d = Number(a.candidate.is_read) - Number(b.candidate.is_read); if (d) return d; }
        return b.candidate.received_at.localeCompare(a.candidate.received_at);
      });
    return { items: clone(items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize)), total: items.length };
  },

  async setRead(ids, read) {
    await sleep(NET / 2);
    store.candidates.filter((c) => ids.includes(c.candidate_id)).forEach((c) => { c.is_read = read; });
    persist();
  },

  async setStarred(id, starred) {
    await sleep(NET / 2);
    const c = store.candidates.find((x) => x.candidate_id === id);
    if (c) c.starred = starred;
    persist();
  },

  async saveNote(id, note) {
    await sleep(NET / 2);
    const c = store.candidates.find((x) => x.candidate_id === id);
    if (c) { c.hr_note = note.trim() || null; c.hr_note_at = new Date().toISOString(); c.hr_note_by = 'demo@example.com'; }
    persist();
  },

  async countDeletableRead(jobId) {
    await sleep(NET / 2);
    const job = store.jobs.find((j) => j.job_id === jobId);
    return job ? store.candidates.filter((c) => deletable(c, job.position_name)).length : 0;
  },

  async deleteReadCandidates(jobId) {
    await sleep(NET * 2);
    const job = store.jobs.find((j) => j.job_id === jobId);
    if (!job) return 0;
    const ids = new Set(store.candidates.filter((c) => deletable(c, job.position_name)).map((c) => c.candidate_id));
    store.candidates = store.candidates.filter((c) => !ids.has(c.candidate_id));
    store.matches = store.matches.filter((m) => !ids.has(m.candidate_id));
    store.logs = store.logs.filter((l) => !l.candidate_id || !ids.has(l.candidate_id));
    persist();
    return ids.size;
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

  async retryMany(ids) {
    await sleep(NET);
    let n = 0;
    for (const id of ids) {
      const c = store.candidates.find((x) => x.candidate_id === id);
      if (!c) continue;
      c.processing_status = 'pending';
      c.processing_error = null;
      processCandidate(id);
      n++;
    }
    persist();
    return n;
  },

  async listLogs() {
    await sleep(NET);
    return clone(store.logs);
  },

  async listAudit() {
    await sleep(NET);
    return clone(auditLocal);
  },

  async logExport(target, rows) {
    auditLocal.unshift({ id: Date.now(), at: new Date().toISOString(), actor: 'demo@example.com', action: 'export_csv', target, detail: { rows } });
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
