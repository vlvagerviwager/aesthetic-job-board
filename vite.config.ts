import { defineConfig } from "vite";

const LOCAL_DEV_PORT = 5192;
const BUILD_OUTPUT_DIR = "dist";

export default defineConfig({
  base: "./",
  server: {
    port: LOCAL_DEV_PORT,
  },
  build: {
    outDir: BUILD_OUTPUT_DIR,
    target: "es2022",
  },
});
