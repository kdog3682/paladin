import fs from "fs";
import os from "os";
import path from "path";

const PROJECT_NAME = "paladin";
const PACKAGE_NAME = "cme"; // package dir under packages/ to process
const DRY_RUN = false;
const ADD_IF_MISSING = true; // insert a path comment when a src/ file lacks one

const PROJECT_ROOT = path.join(os.homedir(), "projects", PROJECT_NAME);
const PACKAGES_DIR = path.join(PROJECT_ROOT, "packages");

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const SRC_DIR = "src"; // only files inside this dir are processed; it's stripped
const SCAN_LINES = 3; // only the top N lines are inspected
const IGNORE = new Set(["node_modules", "dist", "build", ".git"]);

// A path comment: `//` whose content is a path-ish token ending in a code ext.
const PATH_COMMENT = new RegExp(
  `^\\s*//\\s*\\S+(?:${EXTS.map((e) => e.replace(".", "\\.")).join("|")})\\s*$`
);

function log(...args) {
  console.log(DRY_RUN ? "[dry-run]" : "[apply]", ...args);
}

function pkgName(dir) {
  const raw = fs.readFileSync(path.join(dir, "package.json"), "utf8");
  return raw.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? path.basename(dir);
}

// Rel path from the package's src/ root (the src segment is dropped).
function relForFile(srcRoot, file) {
  return path.relative(srcRoot, file).split(path.sep).join("/");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTS.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function processFile(srcRoot, name, file) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split("\n");
  const desired = `// ${name}/${relForFile(srcRoot, file)}`;

  const idx = lines.slice(0, SCAN_LINES).findIndex((l) => PATH_COMMENT.test(l));

  if (idx === -1) {
    if (!ADD_IF_MISSING) return false;
    lines.unshift(desired); // insert at top
    if (!DRY_RUN) fs.writeFileSync(file, lines.join("\n"));
    log(`added  ${path.relative(PROJECT_ROOT, file)} -> ${desired}`);
    return true;
  }

  if (lines[idx] === desired) return false; // already correct
  lines[idx] = desired;
  if (!DRY_RUN) fs.writeFileSync(file, lines.join("\n"));
  log(`fixed  ${path.relative(PROJECT_ROOT, file)} -> ${desired}`);
  return true;
}

function main() {
  const dir = path.join(PACKAGES_DIR, PACKAGE_NAME);
  if (!fs.existsSync(path.join(dir, "package.json"))) {
    throw new Error(`Package not found: ${dir}`);
  }

  const srcRoot = path.join(dir, SRC_DIR);
  if (!fs.existsSync(srcRoot)) {
    throw new Error(`No src/ dir in: ${dir}`);
  }

  const name = pkgName(dir);
  let changed = 0;
  for (const file of walk(srcRoot)) {
    if (processFile(srcRoot, name, file)) changed++;
  }
  log(`done. updated ${changed} path comment(s).`);
}

main();
