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
        // NOTE: the comparison's own allowance for a pixel's colour, a
        // tenth, lets a ground go from one tone to the next unnoticed, which
        // is the very thing these pictures are kept to notice. A hundredth
        // is what a browser's rounding comes to: the same colour written
        // another way (a share of a token in place of `rgb()`) is drawn a
        // level or two apart in a letter's edge, and nothing a listener
        // could see is as near as that. No pixel may be further off.
        expect: {
          toMatchScreenshot: {
            comparatorName: "pixelmatch",
            comparatorOptions: { threshold: 0.01, allowedMismatchedPixels: 0 },
          },
        },
      },
    },
  }),
);
