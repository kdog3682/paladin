import { homedir } from 'node:os';
import { normalize, sep } from 'node:path';

/**
 * Turns a full package path into its aliased form.
 * ~/projects/paladin/packages/foobar/a/b.ts -> @paladin/foobar/a/b.ts
 */
export function toAliasedPath(fullPath: string): string {
  // expand ~ and normalize separators to '/'
  const expanded = fullPath.replace(/^~(?=$|\/)/, homedir());
  const parts = normalize(expanded).split(sep).join('/').split('/').filter(Boolean);

  const projIdx = parts.indexOf('projects');
  if (projIdx === -1) throw new Error(`no "projects" segment in path: ${fullPath}`);

  const project = parts[projIdx + 1];
  const pkgKeyword = parts[projIdx + 2]; // expected 'packages'
  const pkg = parts[projIdx + 3];

  if (!project || pkgKeyword !== 'packages' || !pkg) {
    throw new Error(`unexpected path shape: ${fullPath}`);
  }

  const rest = parts.slice(projIdx + 4).join('/');
  return rest ? `@${project}/${pkg}/${rest}` : `@${project}/${pkg}`;
}
