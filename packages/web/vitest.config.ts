import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import app from "./vite.config.ts";

// Every test runs in a real browser, the one the app is drawn in: there is no
// stand-in for a document. The app is built for the tests as it is built to
// run, with its plugins and its style sheet, so the tests that look at it
// (`test/visual`) see what a listener would, and compare it with a picture
// kept beside them (`toMatchScreenshot`).
export default mergeConfig(
  app,
  defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/vitest-setup.ts"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
        screenshotFailures: false,
      },
    },
  }),
);
