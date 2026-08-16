#!/usr/bin/env node
// Sets the app version at build time from the git tag (e.g. "v1.2.3").
//
// The repository no longer carries a hardcoded release version: tauri.conf.json
// references package.json ("version": "../package.json") and Cargo.toml keeps a
// 0.0.0 placeholder. CI derives the version from the pushed tag and calls this
// script to inject it before building (see .github/workflows/release.yml).
//
// Usage: node scripts/set-version.mjs <v1.2.3 | 1.2.3>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = (process.argv[2] ?? "").trim();
const version = raw.replace(/^v/, "");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!SEMVER.test(version)) {
  console.error(
    `[set-version] Invalid version "${raw}" (expected semver like 1.2.3 or v1.2.3)`,
  );
  process.exit(1);
}

// package.json — tauri.conf.json points here via "version": "../package.json".
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`[set-version] package.json -> ${version}`);

// src-tauri/Cargo.toml — keeps the crate version in sync with the tag.
const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");
if (!/^version\s*=\s*"[^"]*"/m.test(cargo)) {
  console.error(
    '[set-version] Could not find a [package] "version" line in src-tauri/Cargo.toml',
  );
  process.exit(1);
}
cargo = cargo.replace(/^(version\s*=\s*")[^"]*(".*)$/m, `$1${version}$2`);
writeFileSync(cargoPath, cargo);
console.log(`[set-version] src-tauri/Cargo.toml -> ${version}`);