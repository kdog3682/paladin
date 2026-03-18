// @paladin/project-viewer-frontend/src/lib/cn.ts
/** Merge class names, filtering out falsy values. */
export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(" ")
}
