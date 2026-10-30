import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./", // relative paths so the build also runs from file:// inside the Windows app
  test: { globals: true },
});
