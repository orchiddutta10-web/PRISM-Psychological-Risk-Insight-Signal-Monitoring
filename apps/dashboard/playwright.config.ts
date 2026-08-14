import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const dashboardDirectory = path.resolve(__dirname);
const apiDirectory = path.resolve(dashboardDirectory, '../../services/api');
const repositoryDirectory = path.resolve(dashboardDirectory, '../..');
const virtualEnvironmentPython = process.platform === 'win32'
  ? path.join(repositoryDirectory, '.venv', 'Scripts', 'python.exe')
  : path.join(repositoryDirectory, '.venv', 'bin', 'python');
const pythonCommand = fs.existsSync(virtualEnvironmentPython)
  ? JSON.stringify(virtualEnvironmentPython)
  : process.platform === 'win32' ? 'python' : 'python3';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `${pythonCommand} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: apiDirectory,
      url: 'http://127.0.0.1:8000/',
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '8000',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300 * 1000,
    },
    {
      command: 'npm run start',
      cwd: dashboardDirectory,
      url: 'http://127.0.0.1:3000',
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8000',
        HOSTNAME: '127.0.0.1',
        PORT: '3000',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300 * 1000,
    },
  ],
});
