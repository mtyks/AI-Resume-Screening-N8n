import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Api } from './api';
import type {
  ApplicantItem, ApplicantPage, ApplicationInput, AuthorizedUser, Candidate, Job, MatchResult,
  AuditEntry, OpenPosition, PositionStat, Role, SubmitResult, SystemConfig, SystemLog
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
    fd.set('consent', 'true'); // ฟอร์มบังคับติ๊กยินยอมก่อนส่ง Edge Function ตรวจซ้ำอีกชั้น
    if (input.turnstileToken) fd.set('cf-turnstile-response', input.turnstileToken);
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

  async positionStats(): Promise<PositionStat[]> {
    const rows = (ok(await sb().rpc('position_stats')) ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      job_id: String(r.job_id),
      position_name: String(r.position_name),
      is_active: Boolean(r.is_active),
      match_threshold: Number(r.match_threshold),
      close_at: (r.close_at as string | null) ?? null,
      total: Number(r.total), unread: Number(r.unread), starred: Number(r.starred),
      pending: Number(r.pending), failed: Number(r.failed), passed: Number(r.passed),
      below: Number(r.below), gate: Number(r.gate), hired: Number(r.hired),
      avg_score: r.avg_score === null || r.avg_score === undefined ? null : Number(r.avg_score),
      buckets: ((r.buckets as number[] | null) ?? []).map(Number)
    }));
  },

  async listApplicants(q): Promise<ApplicantPage> {
    // กรอง ค้นหา เรียง และแบ่งหน้าทำในฐานข้อมูล (ฟังก์ชัน list_position_applicants) ดึงมาเฉพาะหน้าที่เปิดดู
    const rows = (ok(await sb().rpc('list_position_applicants', {
      p_job_id: q.jobId,
      p_q: q.q?.trim() || null,
      p_kind: q.kind ?? 'all',
      p_app_status: q.appStatus || null,
      p_unread: q.unread ?? false,
      p_starred: q.starred ?? false,
      p_sort: q.sort ?? 'score',
      p_limit: q.pageSize,
      p_offset: (q.page - 1) * q.pageSize
    })) ?? []) as Record<string, unknown>[];
    const items: ApplicantItem[] = rows.map((r) => ({
      candidate: {
        candidate_id: String(r.candidate_id), full_name: String(r.full_name), phone_number: String(r.phone_number),
        email: String(r.email), applied_position: String(r.applied_position),
        self_reported_experience_range: (r.self_reported_experience_range as string | null) ?? null,
        skills: (r.skills as string[] | null) ?? [], resume_file_url: String(r.resume_file_url),
        received_at: String(r.received_at), application_status: String(r.application_status),
        processing_status: r.processing_status as Candidate['processing_status'],
        processing_error: (r.processing_error as string | null) ?? null,
        is_read: Boolean(r.is_read), starred: Boolean(r.starred), hr_note: (r.hr_note as string | null) ?? null
      },
      score: r.match_score === null || r.match_score === undefined ? null : Number(r.match_score),
      gate: (r.gate_status as string | null) ?? null,
      kind: r.kind as ApplicantItem['kind']
    }));
    return { items, total: rows.length ? Number(rows[0].total_count) : 0 };
  },

  async setRead(ids, read) {
    if (!ids.length) return;
    ok(await sb().from('candidates').update({ is_read: read, read_at: read ? new Date().toISOString() : null }).in('candidate_id', ids));
  },

  async setStarred(id, starred) {
    ok(await sb().from('candidates').update({ starred }).eq('candidate_id', id));
  },

  async saveNote(id, note) {
    const { data } = await sb().auth.getSession();
    const text = note.trim();
    ok(await sb().from('candidates').update({ hr_note: text || null, hr_note_at: new Date().toISOString(), hr_note_by: data.session?.user.email ?? null }).eq('candidate_id', id));
  },

  async countDeletableRead(jobId) {
    const job = ok(await sb().from('job_requirements').select('position_name').eq('job_id', jobId).maybeSingle()) as { position_name: string } | null;
    if (!job) return 0;
    const { count, error } = await sb().from('candidates').select('candidate_id', { count: 'exact', head: true })
      .eq('applied_position', job.position_name).eq('is_read', true).eq('starred', false).neq('application_status', 'Hired');
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async deleteReadCandidates(jobId) {
    // ฐานข้อมูลลบแถวและคืนที่อยู่ไฟล์ Resume มา จากนั้นลบไฟล์ใน Storage ต่อ
    const { data, error } = await sb().rpc('delete_read_candidates', { p_job_id: jobId });
    if (error) {
      if (/could not find the function|does not exist/i.test(error.message)) {
        throw new Error('ยังไม่ได้เปิดใช้ฟังก์ชันลบในฐานข้อมูล ให้ผู้ดูแลรันไฟล์ supabase/migrations/20261022b_delete_read_candidates.sql ใน Supabase SQL Editor หนึ่งครั้ง');
      }
      throw new Error(error.message);
    }
    const urls = (data ?? []) as string[];
    const paths = urls.map((u) => u.match(/\/object\/(?:public\/)?resumes\/(.+)$/)?.[1]).filter((x): x is string => Boolean(x)).map(decodeURIComponent);
    for (let i = 0; i < paths.length; i += 100) {
      await sb().storage.from('resumes').remove(paths.slice(i, i + 100)); // ไฟล์ที่ลบไม่ได้ไม่ทำให้การลบข้อมูลล้ม
    }
    return urls.length;
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

  async setApplicationStatus(id, status, notify = true) {
    const changed = Boolean(ok(await sb().rpc('set_application_status', { p_candidate_id: id, p_status: status, p_notify: notify })));
    return { changed, queued: changed && notify };
  },

  async pipelineHealth() {
    try {
      const rows = ok(await sb().rpc('pipeline_health')) as { stuck: number; oldest_minutes: number }[] | null;
      return rows?.[0] ?? { stuck: 0, oldest_minutes: 0 };
    } catch { return { stuck: 0, oldest_minutes: 0 }; }
  },

  async retryCandidate(id) {
    ok(await sb().rpc('request_rescan', { p_candidate_id: id }));
  },

  async retryMany(ids: string[]): Promise<number> {
    return Number(ok(await sb().rpc('request_rescan_many', { p_ids: ids })) ?? 0);
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

  async listAudit(): Promise<AuditEntry[]> {
    return ok(await sb().from('audit_log').select('*').order('at', { ascending: false }).limit(500)) ?? [];
  },

  async logExport(target: string, rows: number): Promise<void> {
    // บันทึกประวัติเป็นเรื่องรอง ถ้าบันทึกไม่ได้ไม่ควรทำให้การส่งออกล้ม
    try { await sb().rpc('log_audit', { p_action: 'export_csv', p_target: target, p_detail: { rows } }); } catch { /* ignore */ }
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
