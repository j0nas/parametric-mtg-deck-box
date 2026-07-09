import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // Relative base so the built bundle works from any path — standalone at "/" and embedded under a
  // subdirectory. The dev server ignores a relative base and still serves at "/".
  base: "./",
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  // Vitest config, bundled with vite-plus and run via `vp test`. All tests are pure Node — they
  // exercise the parameter/derived-dimension math, not the DOM or the WASM kernel.
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
