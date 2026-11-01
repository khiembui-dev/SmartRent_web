import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const source = env.VITE_DATA_SOURCE || 'mock';
  if (!['mock', 'api'].includes(source)) {
    throw new Error(`VITE_DATA_SOURCE phải là "mock" hoặc "api", nhận "${source}".`);
  }
  const proxyTarget = env.VITE_DEV_API_PROXY;
  return {
    base: env.VITE_BASE_PATH || '/',
    server: {
      port: 5173,
      proxy: proxyTarget ? { '/api': { target: proxyTarget, changeOrigin: true } } : undefined,
    },
    preview: { port: 4173 },
    css: {
      preprocessorOptions: {
        scss: {
          // Bootstrap 5.3 vẫn dùng @import/hàm toàn cục của Sass; ẩn cảnh báo từ thư viện, giữ cảnh báo của mã dự án.
          quietDeps: true,
          silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 900,
    },
  };
});
