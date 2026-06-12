import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Pure simulation modules need no DOM. config.ts is guarded so it can be
        // imported here; Renderer/main.ts depend on the DOM and are not unit-tested.
        environment: 'node',
        // Fast loop by default; the long-horizon suites (*.soak.test.ts) run via
        // `npm run test:soak` / `npm run test:all`.
        include: ['src/**/*.test.ts'],
        exclude: ['**/node_modules/**', 'src/**/*.soak.test.ts'],
        // Threads instead of the default forks: per-file process spawn dominated
        // the runtime (collect ~40s for ~5s of tests) on Windows.
        pool: 'threads',
    },
});
