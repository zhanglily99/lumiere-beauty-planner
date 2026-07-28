import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = repositoryName ? `/${repositoryName}/` : "/";

export default defineConfig({
  base,
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    {
      name: "github-pages-product-paths",
      enforce: "pre",
      transform(code, id) {
        if (!id.replaceAll("\\", "/").endsWith("/app/page.tsx")) {
          return null;
        }

        return code.replaceAll('"/products/', '"products/');
      },
    },
    react(),
  ],
  build: {
    outDir: "github-dist",
    emptyOutDir: true,
  },
});
