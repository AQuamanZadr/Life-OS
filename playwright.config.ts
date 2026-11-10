import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}`, locale: "ru-RU" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: `http://localhost:${port}`,
    // Тесты идут без входа и облака, чтобы не трогать настоящие данные.
    env: { NEXT_PUBLIC_LOCAL_ONLY: "1" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
