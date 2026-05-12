import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import svgr from 'vite-plugin-svgr';
import { checker } from 'vite-plugin-checker';
export default defineConfig({
    server: {
        allowedHosts: ['localhost'],
    },
    plugins: [
        react(),
        nodePolyfills(),
        svgr(),
        checker({
            typescript: true,
        }),
    ],
    resolve: { alias: { '@': '/src' } },
});
