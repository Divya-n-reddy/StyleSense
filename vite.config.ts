import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use process.cwd() to get the project root for loading environment variables.
  // Cast process to any to bypass TypeScript error if Node.js types are not fully recognized in this file.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.VITE_API_KEY || "")
    },
    build: {
      target: 'esnext'
    }
  };
});