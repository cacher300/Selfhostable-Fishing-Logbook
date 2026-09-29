// Build the browser bundle: static/js/main.js + static/css/app.css -> static/dist/.
//
//   node scripts/build-frontend.mjs           one-off production build
//   node scripts/build-frontend.mjs --watch   rebuild on change during development
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const outdir = path.join(root, "static", "dist");
const watch = process.argv.includes("--watch");

const options = {
  absWorkingDir: root,
  entryPoints: {
    app: "static/js/main.js",
    "app-styles": "static/css/app.css",
  },
  outdir,
  bundle: true,
  format: "iife",
  target: ["es2022"],
  minify: !watch,
  sourcemap: true,
  legalComments: "linked",
  loader: {
    ".png": "file",
    ".svg": "file",
    ".woff": "file",
    ".woff2": "file",
  },
  assetNames: "assets/[name]-[hash]",
  logLevel: "warning",
  metafile: true,
};

function writeManifest() {
  // Content hashes become ?v= query strings so browsers refetch changed
  // assets without hand-maintained version strings.
  const manifest = {};
  for (const [name, file] of [["app.js", "app.js"], ["app.css", "app-styles.css"]]) {
    const content = fs.readFileSync(path.join(outdir, file));
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
    manifest[name] = `static/dist/${file}?v=${hash}`;
  }
  fs.writeFileSync(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

const manifestPlugin = {
  name: "manifest",
  setup(build) {
    build.onEnd((result) => {
      if (!result.errors.length) writeManifest();
    });
  },
};

fs.rmSync(outdir, { recursive: true, force: true });
if (watch) {
  const context = await esbuild.context({ ...options, plugins: [manifestPlugin] });
  await context.watch();
  console.log("Watching static/js and static/css for changes...");
} else {
  await esbuild.build({ ...options, plugins: [manifestPlugin] });
  console.log(`Built ${path.relative(root, outdir)}`);
}
