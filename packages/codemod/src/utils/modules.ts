import { ts, type Project, type SourceFile } from "ts-morph"

/**
 * Resolves a module specifier written in a file to the project source file it points at,
 * adding that file to the project on demand. Lets a codemod start from a handful of files and
 * pull in the rest only as it follows imports. Returns undefined for modules that resolve into
 * node_modules, to a declaration file, or to nothing at all.
 */
export function resolveModuleFile(
  project: Project,
  from: SourceFile,
  specifier: string,
): SourceFile | undefined {
  const { resolvedModule } = ts.resolveModuleName(
    specifier,
    from.getFilePath(),
    project.getCompilerOptions(),
    project.getModuleResolutionHost(),
  )
  if (!resolvedModule || resolvedModule.isExternalLibraryImport) return
  const path = resolvedModule.resolvedFileName
  if (/\.d\.[mc]?ts$/.test(path)) return
  // not getSourceFile first: a file the program already parsed while resolving imports sits in
  // ts-morph's cache without being part of the project, and adding it is what marks it as such
  return project.addSourceFileAtPathIfExists(path)
}
