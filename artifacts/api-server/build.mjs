import { createRequire, builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, cp, writeFile, access } from "node:fs/promises";

// Resolve the installed version of an external package so it can be pinned
// deterministically in the generated deploy package.json. Tries: (1) walk up
// from the resolved entry file to the package's own package.json, (2) the
// api-server's declared dependency range. Returns null when the version can't
// be determined — see the caller for why such packages are skipped rather than
// pinned to a floating "latest" (which would be non-deterministic).
function resolvePkgVersion(require, artifactDir, name) {
  try {
    let dir = path.dirname(require.resolve(name));
    const root = path.parse(dir).root;
    while (dir !== root) {
      const pj = path.join(dir, "package.json");
      if (existsSync(pj)) {
        const json = JSON.parse(readFileSync(pj, "utf8"));
        if (json.name === name && json.version) return `^${json.version}`;
      }
      dir = path.dirname(dir);
    }
  } catch {
    // fall through to declared range / null
  }
  try {
    const apiPkg = JSON.parse(
      readFileSync(path.join(artifactDir, "package.json"), "utf8"),
    );
    const declared =
      apiPkg.dependencies?.[name] ?? apiPkg.devDependencies?.[name];
    if (declared) return declared;
  } catch {
    // fall through to null
  }
  return null;
}

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  const result = await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    metafile: true,
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  // Copy the built React frontend into dist/public so the single bundled
  // server can serve the whole app on one port (e.g. Hostinger Node hosting).
  const frontendDist = path.resolve(artifactDir, "../clash-zen/dist/public");
  try {
    await access(frontendDist);
    await cp(frontendDist, path.resolve(distDir, "public"), { recursive: true });
    console.log("✓ Copied frontend build into dist/public");
  } catch {
    const msg = `Frontend build not found at ${frontendDist} — run the clash-zen build first to produce a deployable bundle.`;
    // For deploy builds (DEPLOY_BUILD=1, set by the root "build:deploy" script)
    // a missing frontend must fail loudly rather than silently emit an
    // API-only bundle that would 404 the whole site once deployed.
    if (process.env.DEPLOY_BUILD) {
      throw new Error(
        `${msg} Refusing to emit an API-only bundle for a deploy build.`,
      );
    }
    console.warn(`⚠ ${msg}`);
  }

  // Detect which packages were left external (not bundled) but are still
  // imported at runtime, and pin them in the generated package.json so
  // `npm install` fetches them on the deploy target (e.g. Hostinger).
  // esbuild's metafile gives the authoritative list of external imports.
  const require = createRequire(import.meta.url);
  const builtins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ]);
  // Optional/native packages that the app runs fine without — never require them.
  const skip = new Set(["pg-native"]);

  const specifiers = new Set();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imp of output.imports ?? []) {
      if (!imp.external) continue;
      const spec = imp.path;
      if (builtins.has(spec) || spec.startsWith("node:")) continue;
      // Normalize "pkg/sub/path" → package name ("@scope/pkg" or "pkg").
      const parts = spec.split("/");
      const name = spec.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
      if (builtins.has(name) || skip.has(name)) continue;
      specifiers.add(name);
    }
  }

  const dependencies = {};
  const skippedUnresolved = [];
  for (const name of [...specifiers].sort()) {
    const version = resolvePkgVersion(require, artifactDir, name);
    if (version) {
      dependencies[name] = version;
    } else {
      // Not present in our resolved dependency tree. These are optional peer
      // deps (e.g. pino-pretty's "supports-color": "*") that the app runs fine
      // without — proven by dev, where they are not installed. Skip rather than
      // pin a floating "latest", which would be non-deterministic across deploys.
      skippedUnresolved.push(name);
    }
  }
  if (skippedUnresolved.length) {
    console.warn(
      `⚠ Skipped unresolved optional external(s): ${skippedUnresolved.join(", ")} (not in workspace dependency tree; treated as optional).`,
    );
  }

  // Emit a standalone package.json so the dist/ folder can be deployed as-is.
  // esbuild bundles everything else; only the few packages above need install.
  await writeFile(
    path.resolve(distDir, "package.json"),
    JSON.stringify(
      {
        name: "clash-ren",
        version: "1.0.0",
        private: true,
        type: "module",
        scripts: { start: "node --enable-source-maps index.mjs" },
        dependencies,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `✓ Wrote standalone dist/package.json (runtime deps: ${
      Object.keys(dependencies).join(", ") || "none"
    })`,
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
