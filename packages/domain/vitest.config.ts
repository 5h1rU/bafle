import { defineConfig } from "vitest/config";

// NOTE: the name heads this package's report in the summary of a CI run, where
// every package's tests write one.
export default defineConfig({
  test: { name: "domain", include: ["test/**/*.test.ts"], testTimeout: 30_000 },
});
