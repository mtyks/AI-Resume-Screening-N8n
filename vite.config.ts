import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// build ออกมาเป็นไฟล์ HTML ไฟล์เดียว (dist/index.html) เปิดได้ทั้งบน static host และดับเบิลคลิกจากเครื่อง
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './'
});
