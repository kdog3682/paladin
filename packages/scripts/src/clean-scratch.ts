import { clip } from "@paladin/utils/clip";
import {
  readdir,
  stat,
  rename,
  unlink,
  mkdir,
  copyFile,
  access,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname, parse, resolve } from "node:path";

const SCRATCH = join(homedir(), "scratch");
const MEDIA = join(homedir(), "documents", "media");
const TRASH = join(homedir(), "trash");

const MOVE_EXTS = new Set([".pdf", ".json"]);
const KILL_EXTS = new Set([
  ".ts",
  ".tsx",
  ".py",
  ".typ",
  ".md",
  ".mmd",
  ".mjs",
  ".html",
  ".htm",
]);
const MIN_BYTES = 10

// scratch markers anywhere in the filename: build.temp.json, temp-notes.pdf
const isTemp = (name: string) => {
  const n = name.toLowerCase()
  return n.includes(".temp.") || n.includes("temp-")
};

const args = process.argv.slice(2);
// --soft sends deletions to ~/trash instead of unlinking
const SOFT = args.includes("--soft");
const directory = resolve(args.find((a) => !a.startsWith("--")) ?? SCRATCH);

type Row = {
  file: string;
  bytes: number;
  action: "move" | "trash" | "delete" | "keep" | "error";
  reason: string;
};

const startOfToday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Pick a non-colliding destination: foo.pdf -> foo-1.pdf -> foo-2.pdf */
async function freeDest(dir: string, name: string) {
  const { name: stem, ext } = parse(name);
  let candidate = join(dir, name);
  let n = 0;
  while (await exists(candidate)) {
    n++;
    candidate = join(dir, `${stem}-${n}${ext}`);
  }
  return candidate;
}

async function move(from: string, to: string) {
  try {
    await rename(from, to);
  } catch (err: any) {
    // source and destination may sit on different mounts
    if (err?.code !== "EXDEV") throw err;
    await copyFile(from, to);
    await unlink(from);
  }
}

async function main() {
  if (!(await exists(directory))) {
    clip(`no such directory: ${directory}`);
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const rows: Row[] = [];
  let mediaReady = false;
  let trashReady = false;

  const remove = async (src: string, name: string) => {
    if (!SOFT) {
      await unlink(src);
      return "delete" as const;
    }
    if (!trashReady) {
      await mkdir(TRASH, { recursive: true });
      trashReady = true;
    }
    await move(src, await freeDest(TRASH, name));
    return "trash" as const;
  };

  for (const entry of entries) {
    if (!entry.isFile()) continue; // dirs & symlinks left alone

    const name = entry.name;
    const src = join(directory, name);
    const ext = extname(name).toLowerCase();

    try {
      const info = await stat(src);

      // 1. runts go first, whatever the extension
      if (info.size < MIN_BYTES) {
        rows.push({
          file: name,
          bytes: info.size,
          action: await remove(src, name),
          reason: `< ${MIN_BYTES} bytes`,
        });
        continue;
      }

      // 2. temp markers in the name, whatever the extension
      if (isTemp(name)) {
        rows.push({
          file: name,
          bytes: info.size,
          action: await remove(src, name),
          reason: "temp marker",
        })
        continue
      }

      // 3. source / markup scratch files
      if (KILL_EXTS.has(ext)) {
        rows.push({
          file: name,
          bytes: info.size,
          action: await remove(src, name),
          reason: `${ext} file`,
        });
        continue;
      }

      // 4. stale archives — anything not written today
      if (ext === ".zip") {
        if (info.mtimeMs < startOfToday) {
          rows.push({
            file: name,
            bytes: info.size,
            action: await remove(src, name),
            reason: `zip from ${info.mtime.toISOString().slice(0, 10)}`,
          });
        } else {
          rows.push({
            file: name,
            bytes: info.size,
            action: "keep",
            reason: "zip from today",
          });
        }
        continue;
      }

      // 5. keepers get filed
      if (MOVE_EXTS.has(ext)) {
        if (!mediaReady) {
          await mkdir(MEDIA, { recursive: true });
          mediaReady = true;
        }
        const dest = await freeDest(MEDIA, name);
        await move(src, dest);
        rows.push({
          file: name,
          bytes: info.size,
          action: "move",
          reason: `-> documents/media/${parse(dest).base}`,
        });
        continue;
      }

      rows.push({ file: name, bytes: info.size, action: "keep", reason: ext || "no ext" });
    } catch (err: any) {
      rows.push({ file: name, bytes: -1, action: "error", reason: String(err?.message ?? err) });
    }
  }

  const tally = (a: Row["action"]) => rows.filter((r) => r.action === a).length;

  clip({
    directory,
    mode: SOFT ? `soft — deletions sent to ${TRASH}` : "hard",
    moved: tally("move"),
    deleted: tally("delete") + tally("trash"),
    kept: tally("keep"),
    errors: tally("error"),
    files: rows,
  });
}

main();
