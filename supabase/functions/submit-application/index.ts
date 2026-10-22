// submit-application: รับใบสมัครจากหน้าเว็บ แล้วส่งต่อ n8n webhook โดยใส่ x-api-key ฝั่งเซิร์ฟเวอร์
// ถ้า n8n ล่ม/ไม่ตอบ จะเก็บใบสมัครไว้เป็นสถานะ pending เอง แล้วตัวกวางานใน n8n จะประมวลผลให้ภายหลัง
// Secrets ที่ต้องตั้ง: N8N_WEBHOOK_URL, N8N_WEBHOOK_KEY
// Secrets เสริม (ไม่ตั้งก็ทำงานได้):
//   ALLOWED_ORIGINS   โดเมนเว็บที่อนุญาต คั่นด้วย comma เช่น https://my-app.vercel.app  (ไม่ตั้ง = รับทุกโดเมน)
//   TURNSTILE_SECRET  Secret key ของ Cloudflare Turnstile (ฟรี) ตั้งแล้วจะบังคับยืนยันว่าไม่ใช่บอท
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow = ALLOWED.length === 0 ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
let CORS: Record<string, string> = corsFor(new Request('http://x'));
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const EXPERIENCE = ['ไม่มีประสบการณ์ (นักศึกษาจบใหม่)', '1-3 ปี', '3-5 ปี', 'มากกว่า 5 ปี'];
const MAX_BYTES = 5 * 1024 * 1024;

// ไฟล์ PDF จริงต้องขึ้นต้นด้วย "%PDF-" (กันการเปลี่ยนนามสกุล/ประเภทไฟล์อื่นให้ดูเป็น PDF)
async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return head.length === 5 && String.fromCharCode(...head) === '%PDF-';
}

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!secret) return true; // ยังไม่ตั้งค่า = ไม่บังคับ
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(8000)
    });
    return Boolean(((await r.json()) as { success?: boolean }).success);
  } catch { return false; }
}

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  CORS = corsFor(req);
  const origin = req.headers.get('origin');
  if (ALLOWED.length > 0 && origin && !ALLOWED.includes(origin)) return json({ status: 'error', message: 'ไม่อนุญาตให้ส่งจากเว็บนี้' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ status: 'error', message: 'method not allowed' }, 405);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ status: 'error', message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400); }

  // PDPA: ต้องยินยอมก่อนส่ง
  if (form.get('consent') !== 'true') return json({ status: 'error', message: 'กรุณายินยอมให้เก็บข้อมูลก่อนส่งใบสมัคร' }, 400);

  // กันสแปม: Turnstile (ถ้าตั้งค่า) + จำกัดจำนวนครั้งต่อ IP และต่ออีเมล (นับในฐานข้อมูล ฟรี)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (!(await turnstileOk(String(form.get('cf-turnstile-response') ?? ''), ip))) {
    return json({ status: 'error', message: 'ยืนยันตัวตนไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่' }, 400);
  }
  const rl = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const mail = String(form.get('email') ?? '').trim().toLowerCase();
  const [ipOk, mailOk] = await Promise.all([
    rl.rpc('rate_limit_hit', { p_key: 'ip:' + (await sha(ip)), p_max: 20, p_window_secs: 3600 }),
    rl.rpc('rate_limit_hit', { p_key: 'em:' + (await sha(mail)), p_max: 4, p_window_secs: 3600 })
  ]);
  // ถ้านับไม่ได้ (error) ให้ผ่านไปก่อน ไม่ให้ผู้สมัครจริงถูกบล็อกเพราะระบบนับขัดข้อง
  if (ipOk.data === false || mailOk.data === false) {
    return json({ status: 'error', message: 'ส่งใบสมัครบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' }, 429);
  }

  const file = form.get('resume');
  if (!(file instanceof File) || file.type !== 'application/pdf' || file.size > MAX_BYTES || file.size < 5 || !(await looksLikePdf(file))) {
    return json({ status: 'error', message: 'ไฟล์ Resume ต้องเป็น PDF ขนาดไม่เกิน 5 MB' }, 400);
  }

  const url = Deno.env.get('N8N_WEBHOOK_URL');
  const key = Deno.env.get('N8N_WEBHOOK_KEY');

  // 1) ลองส่งให้ n8n ก่อน (ตอบทันทีหลังบันทึก ไม่รอ AI)
  if (url && key) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'x-api-key': key }, body: form, signal: AbortSignal.timeout(25000) });
      // 2xx/4xx = n8n ตัดสินแล้ว (รับ/ซ้ำ/ข้อมูลไม่ถูก) ส่งต่อผลตามนั้น
      if (res.status < 500) {
        const body = await res.text();
        return new Response(body, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    } catch (_) { /* n8n ไม่ตอบ -> ไปเก็บคิวด้านล่าง */ }
  }

  // 2) สำรอง: เก็บเข้าคิวเอง (pending)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const clean = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
  const rec = {
    full_name: clean(form.get('full_name')),
    phone_number: clean(form.get('phone_number')),
    email: clean(form.get('email')).toLowerCase(),
    applied_position: clean(form.get('applied_position')),
    self_reported_experience_range: clean(form.get('self_reported_experience_range'))
  };
  const bad: string[] = [];
  if (!rec.full_name || rec.full_name.length > 150) bad.push('full_name');
  if (!/^[0-9+\-\s()]{8,20}$/.test(rec.phone_number)) bad.push('phone_number');
  if (rec.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) bad.push('email');
  if (!EXPERIENCE.includes(rec.self_reported_experience_range)) bad.push('self_reported_experience_range');
  const { data: open } = await sb.rpc('open_positions');
  if (!(open ?? []).some((p: { position_name: string }) => p.position_name === rec.applied_position)) bad.push('applied_position');
  if (bad.length) return json({ status: 'error', message: 'ข้อมูลไม่ถูกต้อง: ' + bad.join(', ') }, 400);

  const path = `${crypto.randomUUID()}.pdf`;
  const up = await sb.storage.from('resumes').upload(path, file, { contentType: 'application/pdf' });
  if (up.error) return json({ status: 'error', message: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่' }, 503);

  const candidate_id = 'C' + Date.now().toString().slice(-8) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
  const ins = await sb.from('candidates').insert({
    candidate_id, ...rec,
    resume_file_url: `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/resumes/${path}`,
    processing_status: 'pending'
  });
  if (ins.error) {
    await sb.storage.from('resumes').remove([path]);
    if (ins.error.code === '23505') return json({ status: 'duplicate', message: 'อีเมลนี้สมัครตำแหน่งนี้แล้ว' }, 409);
    return json({ status: 'error', message: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่' }, 503);
  }
  return json({ status: 'received', candidate_id, queued: true });
});
