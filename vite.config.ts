import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' ทำให้ deploy ใต้ path ย่อยได้ (เช่น GitHub Pages: https://user.github.io/repo/)
// ใช้ HashRouter จึงไม่ต้องตั้ง rewrite ฝั่งเซิร์ฟเวอร์
export default defineConfig({
  plugins: [react()],
  base: './'
});
