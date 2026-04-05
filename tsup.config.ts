import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "plugins/index": "src/plugins/index.ts",
    },
    outDir: "dist/esm",
    format: ["esm"],
    outExtension() {
      return { js: ".js" };
    },
    dts: {
      resolve: true,
      outputDir: "dist/types",
    },
    target: "es2022",
    clean: true,
    minify: true,
    sourcemap: true,
    treeShaking: true,
    splitting: false,
    noExternal: [],
  },
  {
    entry: {
      index: "src/index.ts",
      "plugins/index": "src/plugins/index.ts",
    },
    outDir: "dist/cjs",
    format: ["cjs"],
    outExtension() {
      return { js: ".cjs" };
    },
    dts: {
      resolve: true,
      outputDir: "dist/types",
    },
    target: "es2022",
    clean: false,
    minify: true,
    sourcemap: true,
    treeShaking: true,
    splitting: false,
    noExternal: [],
  },
]);
