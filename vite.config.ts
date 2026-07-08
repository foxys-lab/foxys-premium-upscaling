import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages project site: set base to '/ai-video-upscaler/' if needed
  base: process.env.GITHUB_PAGES === "true" ? "/ai-video-upscaler/" : "/",
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});
