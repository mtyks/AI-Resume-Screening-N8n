import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api } from './api';
import type {
  ApplicationInput, AuthorizedUser, Candidate, CandidateRow, Job, MatchResult,
  OpenPosition, Role, SubmitResult, SystemConfig, SystemLog
} from './types';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true เมื่อตั้งค่า .env ครบ → ใช้ฐานข้อมูลจริง */
export const supabaseConfigured = Boolean(URL && KEY);

/**
 * ที่เก็บ session ตามตัวเลือก "จดจำการเข้าสู่ระบบ":
 *  - ติ๊ก  → localStorage  (ปิดเบราว์เซอร์แล้วเปิดใหม่ยังเข้าได้เลย)
 *  - ไม่ติ๊ก → sessionStorage (ปิดแท็บ/เบราว์เซอร์แล้วต้องล็อกอินใหม่)
 * ค่าที่เลือกจำไว้ใน localStorage คีย์ REMEMBER_KEY
 */
const REMEMBER_KEY = 'rs-remember';
function remembered(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
}
export function getRemember(): boolean { return remembered(); }
const authStorage = {
  getItem(k: string): string | null {
    try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; }
  },
  setItem(k: string, v: string): void {
    try {
      const [keep, drop] = remembered() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(k, v);
      drop.removeItem(k);
    } catch { /* ที่เก็บถูกบล็อก: ล็อกอินได้เฉพาะรอบนี้ */ }
  },
  removeItem(k: string): void {
    try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch { /* ignore */ }
  }
};

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!URL || !KEY) throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  client ??= createClient(URL, KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, storage: authStorage } });
  return client;
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

async function roleOf(email: string): Promise<Role | null> {
  const { data } = await sb().from('authorized_users').select('role').ilike('email', email).maybeSingle();
  return (data?.role as Role | undefined) ?? null;
}

export const supabaseApi: Api = {
  async listOpenPositions(): Promise<OpenPosition[]> {
    return ok(await sb().rpc('open_positions')) ?? [];
  },

  async submitApplication(input: ApplicationInput): Promise<SubmitResult> {
    // ส่งผ่าน Edge Function เพราะ x-api-key ของ webhook ต้องอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
    const fd = new FormData();
    fd.set('full_name', input.full_name);
    fd.set('phone_number', input.phone_number);
    fd.set('email', input.email);
    fd.set('applied_position', input.applied_position);
    if (input.self_reported_experience_range) fd.set('self_reported_experience_range', input.self_reported_experience_range);
    fd.set('resume', input.resume);
    try {
      const res = await fetch(`${URL}/functions/v1/submit-application`, { method: 'POST', headers: { apikey: KEY ?? '', Authorization: `Bearer ${KEY}` }, body: fd });
      const j = (await res.json().catch(() => ({}))) as { status?: string; candidate_id?: string; message?: string };
      if (res.ok && j.status === 'received' && j.candidate_id) return { status: 'received', candidate_id: j.candidate_id };
      if (res.status === 409) return { status: 'duplicate', candidate_id: j.candidate_id ?? '' };
      return { status: 'error', message: j.message ?? 'ส่งใบสมัครไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่' };
    } catch {
      return { status: 'error', message: 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง' };
    }
  },

  async signIn() {
    throw new Error('ใช้การเข้าสู่ระบบด้วย Google เท่านั้น');
  },

  async signInGoogle(remember = true) {
    try { localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch { /* ignore */ }
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw new Error(error.message);
  },

  async signOut() {
    await sb().auth.signOut();
  },

  async restoreSession() {
    const { data } = await sb().auth.getSession();
    const email = data.session?.user.email;
    if (!email) return null;
    const role = await roleOf(email);
    if (!role) {
      await sb().auth.signOut(); // ล็อกอิน Google ได้ แต่ไม่อยู่ในรายชื่อที่ได้รับสิทธิ์
      return null;
    }
    return { email, role };
  },

  async listJobs(): Promise<Job[]> {
    return ok(await sb().from('job_requirements').select('*').order('position_name')) ?? [];
  },

  async saveJob(job): Promise<Job> {
    const sum = job.weight_musthave + job.weight_preferred + job.weight_tool;
    if (Math.abs(sum - 1) > 0.0001) throw new Error('น้ำหนักรวมต้องเท่ากับ 100%');
    const row = { ...job, job_id: job.job_id ?? `JOB-${Date.now().toString(36).toUpperCase()}` };
    return ok(await sb().from('job_requirements').upsert(row).select().single()) as Job;
  },

  async listCandidateRows(jobId): Promise<CandidateRow[]> {
    const job = ok(await sb().from('job_requirements').select('position_name').eq('job_id', jobId).maybeSingle()) as { position_name: string } | null;
    if (!job) return [];
    const cands = (ok(await sb().from('candidates').select('*').eq('applied_position', job.position_name).order('received_at', { ascending: false })) ?? []) as Candidate[];
    if (cands.length === 0) return [];
    const matches = (ok(await sb().from('match_results').select('*').eq('job_id', jobId).in('candidate_id', cands.map((c) => c.candidate_id)).order('evaluated_at', { ascending: false })) ?? []) as MatchResult[];
    return cands.map((candidate) => ({ candidate, match: matches.find((m) => m.candidate_id === candidate.candidate_id) ?? null }));
  },

  async getCandidate(id) {
    const candidate = ok(await sb().from('candidates').select('*').eq('candidate_id', id).maybeSingle()) as Candidate | null;
    if (!candidate) return null;
    const job = ok(await sb().from('job_requirements').select('*').eq('position_name', candidate.applied_position).maybeSingle()) as Job | null;
    const match = ok(await sb().from('match_results').select('*').eq('candidate_id', id).order('evaluated_at', { ascending: false }).limit(1).maybeSingle()) as MatchResult | null;
    // log เห็นได้เฉพาะ Admin: HR จะได้รายการว่าง (RLS)
    const logs = ((await sb().from('system_logs').select('*').eq('candidate_id', id).order('timestamp', { ascending: false })).data ?? []) as SystemLog[];
    return { candidate, match, job, logs };
  },

  async setApplicationStatus(id, status) {
    ok(await sb().from('candidates').update({ application_status: status }).eq('candidate_id', id));
  },

  async retryCandidate(id) {
    ok(await sb().rpc('request_rescan', { p_candidate_id: id }));
  },

  async getResumeUrl(candidate): Promise<string | null> {
    // เก็บเป็น URL เต็มของ storage แต่ bucket เป็น private จึงดึงชื่อไฟล์แล้วขอลิงก์ชั่วคราว (10 นาที)
    const m = candidate.resume_file_url.match(/\/object\/(?:public\/)?resumes\/(.+)$/);
    if (!m) return candidate.resume_file_url.startsWith('http') ? candidate.resume_file_url : null;
    const { data, error } = await sb().storage.from('resumes').createSignedUrl(decodeURIComponent(m[1]), 600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  async updateCandidate(id, patch) {
    ok(await sb().from('candidates').update(patch).eq('candidate_id', id));
  },

  async listLogs(): Promise<SystemLog[]> {
    return ok(await sb().from('system_logs').select('*').order('timestamp', { ascending: false }).limit(500)) ?? [];
  },

  async listFailedCandidates(): Promise<Candidate[]> {
    return ok(await sb().from('candidates').select('*').in('processing_status', ['failed', 'pending']).order('received_at', { ascending: false })) ?? [];
  },

  async listUsers(): Promise<AuthorizedUser[]> {
    return ok(await sb().from('authorized_users').select('*').order('added_at')) ?? [];
  },

  async addUser(email, role) {
    ok(await sb().from('authorized_users').insert({ email: email.trim().toLowerCase(), role }));
  },

  async removeUser(email) {
    ok(await sb().from('authorized_users').delete().ilike('email', email));
  },

  async getConfig(): Promise<SystemConfig> {
    // อ่านเฉพาะคีย์ AI_PROVIDER (คีย์อื่นในตารางนี้ไม่มีส่วนไหนใช้)
    const row = ok(await sb().from('system_config').select('config_value').eq('config_key', 'AI_PROVIDER').maybeSingle()) as { config_value: string } | null;
    return { AI_PROVIDER: row?.config_value ?? 'gemini' };
  },

  async saveConfig(config) {
    // Admin สลับ AI ได้ที่นี่ (gemini = คีย์หลัก, gemini_backup = คีย์สำรอง) workflow อ่านค่านี้ทุกครั้งที่ประมวลผล
    if (!['gemini', 'gemini_backup'].includes(config.AI_PROVIDER)) throw new Error('ผู้ให้บริการ AI ไม่ถูกต้อง');
    ok(await sb().from('system_config').update({ config_value: config.AI_PROVIDER }).eq('config_key', 'AI_PROVIDER'));
  },

  async resetDemoData() {
    /* ใช้ได้เฉพาะโหมดทดลอง */
  }
};
