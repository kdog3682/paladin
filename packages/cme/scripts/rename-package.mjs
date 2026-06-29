import fs from "fs";
import os from "os";
import path from "path";

const PROJECT_NAME = "paladin";
const OLD_NAME = "codemirror-editor-experiment";
const NEW_NAME = "cme";
const DRY_RUN = false;

const PROJECT_ROOT = path.join(os.homedir(), "projects", PROJECT_NAME);
const PACKAGES_DIR = path.join(PROJECT_ROOT, "packages");

function log(...args) {
  console.log(DRY_RUN ? "[dry-run]" : "[apply]", ...args);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace every occurrence of the quoted string "from" with "to".
// Works on raw text, so JSONC / trailing commas / formatting all survive.
function replaceQuoted(raw, from, to) {
  const re = new RegExp(`"${escapeRegExp(from)}"`, "g");
  const next = raw.replace(re, `"${to}"`);
  return { next, count: (raw.match(re) || []).length };
}

function listPackageJsons() {
  return fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(PACKAGES_DIR, d.name, "package.json"))
    .filter((f) => fs.existsSync(f));
}

function main() {
  const oldDir = path.join(PACKAGES_DIR, OLD_NAME);
  const newDir = path.join(PACKAGES_DIR, NEW_NAME);

  if (!fs.existsSync(oldDir)) {
    throw new Error(`Source package not found: ${oldDir}`);
  }
  if (fs.existsSync(newDir)) {
    throw new Error(`Target already exists: ${newDir}`);
  }

  // Detect scope from the current name (no full JSON parse needed).
  const targetPkgPath = path.join(oldDir, "package.json");
  const targetRaw = fs.readFileSync(targetPkgPath, "utf8");
  const currentName = targetRaw.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? OLD_NAME;
  const scope = currentName.includes("/")
    ? currentName.slice(0, currentName.lastIndexOf("/") + 1)
    : "";

  // Derive from OLD_NAME so this is safe to rerun even if name was already changed.
  const oldFullName = `${scope}${OLD_NAME}`;
  const newFullName = `${scope}${NEW_NAME}`;

  log(`renaming package "${oldFullName}" -> "${newFullName}"`);

  // Rewrite name + dependency references across all package.json files.
  let refCount = 0;
  for (const file of listPackageJsons()) {
    const raw = fs.readFileSync(file, "utf8");
    const { next, count } = replaceQuoted(raw, oldFullName, newFullName);
    if (count === 0 || next === raw) continue;
    refCount += count;
    if (!DRY_RUN) fs.writeFileSync(file, next);
    log(`updated ${count}x in ${path.relative(PROJECT_ROOT, file)}`);
  }

  // Rename the directory last, after all reads/writes used the old path.
  log(`renaming dir ${path.relative(PROJECT_ROOT, oldDir)} -> ${NEW_NAME}`);
  if (!DRY_RUN) fs.renameSync(oldDir, newDir);

  log(`done. updated ${refCount} string reference(s).`);
}

main();
