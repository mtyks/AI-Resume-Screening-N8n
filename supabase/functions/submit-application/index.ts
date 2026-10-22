// submit-application: รับใบสมัครจากหน้าเว็บ แล้วส่งต่อ n8n webhook โดยใส่ x-api-key ฝั่งเซิร์ฟเวอร์
// ถ้า n8n ล่ม/ไม่ตอบ จะเก็บใบสมัครไว้เป็นสถานะ pending เอง แล้วตัวกวางานใน n8n จะประมวลผลให้ภายหลัง
// Secrets ที่ต้องตั้ง: N8N_WEBHOOK_URL, N8N_WEBHOOK_KEY
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const EXPERIENCE = ['ไม่มีประสบการณ์ (นักศึกษาจบใหม่)', '1-3 ปี', '3-5 ปี', 'มากกว่า 5 ปี'];
const MAX_BYTES = 5 * 1024 * 1024;

// ไฟล์ PDF จริงต้องขึ้นต้นด้วย "%PDF-" (กันการเปลี่ยนนามสกุล/ประเภทไฟล์อื่นให้ดูเป็น PDF)
async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return head.length === 5 && String.fromCharCode(...head) === '%PDF-';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ status: 'error', message: 'method not allowed' }, 405);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ status: 'error', message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400); }

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
