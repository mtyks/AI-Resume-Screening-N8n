import type { Api } from './api';
import { mockApi } from './mock';
import { supabaseApi, supabaseConfigured } from './supabase';

// จุดสลับเดียวของทั้งระบบ: ถ้าตั้ง VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ใน .env จะใช้ฐานข้อมูลจริง
// ไม่ตั้ง = โหมดทดลองด้วยข้อมูลจำลอง
export const isReal = supabaseConfigured;
export const api: Api = isReal ? supabaseApi : mockApi;
export * from './types';
