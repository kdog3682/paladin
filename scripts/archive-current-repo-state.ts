import { $ } from "bun";
import { format } from "date-fns";

/**
 * Archives the current repo state with a commit + annotated tag:
 * archive/YYYY-MM-DD
 */
export async function archiveRepo(message: string) {
  if (!message || !message.trim()) {
    throw new Error("Archive message cannot be empty.");
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const tagName = `archive/${today}`;

  try {
    // Ensure inside git repo
    await $`git rev-parse --is-inside-work-tree`.quiet();

    // Stage all changes
    await $`git add -A`;

    // Check if there are changes
    const status = await $`git status --porcelain`.text();

    if (status.trim()) {
      await $`git commit -m ${message}`;
      console.log("Created commit.");
    } else {
      console.log("No changes to commit.");
    }

    // Check if tag exists
    const existing = await $`git tag --list ${tagName}`.text();
    if (existing.trim()) {
      throw new Error(`Tag '${tagName}' already exists.`);
    }

    // Create annotated tag (supports multiline message)
    await $`git tag -a ${tagName} -m ${message}`;

    console.log(`Archive created with tag: ${tagName}`);
  } catch (err: any) {
    console.error("Archive failed:", err.message);
    throw err;
  }
}
