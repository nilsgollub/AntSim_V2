import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Pure simulation modules need no DOM. config.ts is guarded so it can be
        // imported here; Renderer/main.ts depend on the DOM and are not unit-tested.
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
