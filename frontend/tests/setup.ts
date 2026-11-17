import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { configureWakeRetry } from '../src/lib/api';
afterEach(cleanup);
// Tests assert immediate failures; the sleeping-host retry window is covered in hackathon-polish.test.tsx.
configureWakeRetry(0);
