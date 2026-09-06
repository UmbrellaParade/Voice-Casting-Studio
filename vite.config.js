import { defineConfig } from "vite";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const wordpressAssetsDir = resolve(repositoryRoot, "wordpress-theme/voice-casting-studio/assets");

const wordpressBrandAssets = [
  "umbrella-parade-logo.png",
  "umbrella-parade-concept-logo.png",
  "umbrella-parade-audition-logo.png",
  "voice-cast-studio-icon-32.png",
  "voice-cast-studio-icon-180.png",
  "voice-cast-studio-icon-192.png",
  "voice-cast-studio-icon-512.png"
];

const copyWordPressBrandAsset = (outputDir) => ({
  name: "copy-wordpress-brand-asset",
  closeBundle() {
    rmSync(resolve(outputDir, "index.html"), { force: true });
    const destinationDir = resolve(outputDir, "assets");
    mkdirSync(destinationDir, { recursive: true });
    wordpressBrandAssets.forEach((fileName) => {
      copyFileSync(
        resolve(repositoryRoot, `public/assets/${fileName}`),
        resolve(destinationDir, fileName)
      );
    });
    const accentDictionarySource = resolve(repositoryRoot, "public/accent-dictionary");
    if (existsSync(accentDictionarySource)) {
      cpSync(
        accentDictionarySource,
        resolve(outputDir, "accent-dictionary"),
        { recursive: true }
      );
    }
  }
});

export default defineConfig(({ mode }) => {
  const wordpress = mode === "wordpress";
  const outputDir = process.env.VCS_BUILD_OUTPUT ? resolve(repositoryRoot, process.env.VCS_BUILD_OUTPUT) : wordpressAssetsDir;
  if (wordpress && !outputDir.startsWith(repositoryRoot + (process.platform === "win32" ? "\\" : "/"))) throw new Error("Build output must stay inside the repository.");
  return {
    base: wordpress ? "./" : "/Voice-Casting-Studio/",
    publicDir: wordpress ? false : "public",
    plugins: wordpress ? [copyWordPressBrandAsset(outputDir)] : [],
    build: wordpress ? {
      outDir: outputDir,
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

