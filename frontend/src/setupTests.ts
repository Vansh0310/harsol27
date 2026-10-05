import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Explicit (not vitest `globals: true`) setup, so this is the one place that
// needs to know React Testing Library doesn't auto-register its cleanup
// without a global afterEach - every other test file just gets a clean DOM
// between tests for free.
afterEach(() => {
  cleanup();
});
