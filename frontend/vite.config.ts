import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 + :: — LAN의 다른 기기에서도 접속 가능
    port: 5003,
  },
});
