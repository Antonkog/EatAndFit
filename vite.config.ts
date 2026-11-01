import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolveAppConfiguration } from './app.config.mjs';

export default defineConfig(({ mode }) => {
  const environment = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const configuration = resolveAppConfiguration(environment, mode);
  return {
    define: { __APP_CONFIG__: JSON.stringify(configuration) },
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3000' } },
  };
});

