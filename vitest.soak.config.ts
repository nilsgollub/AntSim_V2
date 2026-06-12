import { defineConfig } from 'vitest/config';

// Long-horizon suites only (soak / multi-seed / quality sweep) — `npm run test:soak`.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.soak.test.ts'],
    },
});
