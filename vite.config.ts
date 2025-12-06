import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Use relative paths for assets
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    }
});
