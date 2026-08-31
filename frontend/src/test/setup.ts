import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('@mantine/core', () => import('@/test/mantine-mock'));
vi.mock('@mantine/notifications', () => ({
  Notifications: () => null,
  notifications: { show: vi.fn() },
}));

afterEach(() => {
  cleanup();
});
