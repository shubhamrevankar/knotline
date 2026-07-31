import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom", "@tanstack/react-query"]
        }
      }
    }
  },
  plugins: [react()],
  server: {
    port: 5173
  }
});
