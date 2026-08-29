import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: Object.fromEntries(
      ["/api", "/files", "/logout"].map((path) => [path, "http://localhost:3001"]),
    ),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("micromark") ||
            id.includes("mdast")
          )
            return "markdown";
          if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion"))
            return "motion";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
  },
});
