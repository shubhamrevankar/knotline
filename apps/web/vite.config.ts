import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    cssMinify: "lightningcss",
    manifest: true,
    minify: "terser",
    terserOptions: {
      module: true,
      compress: {
        passes: 3,
        pure_getters: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@xyflow") && !id.endsWith(".css")) return "flow-vendor";
          if (
            /node_modules\/(?:\.pnpm\/)?(?:react(?:-dom|-router)?@|react\/|react-dom\/|react-router|@tanstack\+react-query|@tanstack\/react-query)/u.test(
              id
            )
          )
            return "react-vendor";
          return undefined;
        }
      }
    }
  },
  plugins: [react()],
  server: {
    port: 5173
  }
});
