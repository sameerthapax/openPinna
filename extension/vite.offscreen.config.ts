import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/offscreen/voiceRecorderOffscreen.ts"),
      formats: ["es"],
      fileName: () => "offscreen/voiceRecorderOffscreen.js",
    },
  },
});
