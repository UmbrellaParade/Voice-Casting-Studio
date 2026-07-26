import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const wordpressAssetsDir = resolve(repositoryRoot, "wordpress-theme/voice-casting-studio/assets");

const copyWordPressBrandAsset = () => ({
  name: "copy-wordpress-brand-asset",
  closeBundle() {
    rmSync(resolve(wordpressAssetsDir, "index.html"), { force: true });
    const destinationDir = resolve(wordpressAssetsDir, "assets");
    mkdirSync(destinationDir, { recursive: true });
    copyFileSync(
      resolve(repositoryRoot, "public/assets/umbrella-parade-logo.png"),
      resolve(destinationDir, "umbrella-parade-logo.png")
    );
    copyFileSync(
      resolve(repositoryRoot, "public/assets/umbrella-parade-concept-logo.png"),
      resolve(destinationDir, "umbrella-parade-concept-logo.png")
    );
  }
});

export default defineConfig(({ mode }) => {
  const wordpress = mode === "wordpress";
  return {
    base: wordpress ? "./" : "/Voice-Casting-Studio/",
    publicDir: wordpress ? false : "public",
    plugins: wordpress ? [copyWordPressBrandAsset()] : [],
    build: wordpress ? {
      outDir: wordpressAssetsDir,
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: "app.js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css") ? "app.css" : "media/[name]-[hash][extname]"
        }
      }
    } : undefined
  };
});

