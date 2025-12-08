import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
    base: './', // Use relative paths for assets
    plugins: [
        legacy({
            targets: ['defaults'], // Broader support
        }),
    ],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        // target: 'es2015', // Plugin handles this now
    }
});
