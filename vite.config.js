import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ base:process.env.SITE_URL ? new URL(process.env.SITE_URL).pathname.replace(/\/?$/,'/') : '/', plugins: [react(), tailwindcss()], build: { rollupOptions: { input: { main: 'index.html', alpine: 'alpine.html' } } } });
