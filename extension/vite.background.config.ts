import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/background/service-worker.ts"),
      formats: ["es"],
      fileName: () => "background.js",
    },
  },
});
