// @paladin/package-management/templates/default.tpl
//
// Default TypeScript package template. Creates a plain TS package
// with a package.json and tsconfig.json that extends the monorepo root.
// Includes @/ path alias for src/.

================================================================
package.json
================================================================
{
  "name": "@{{PROJECT_NAME}}/{{PACKAGE_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {},
  "dependencies": {},
  "exports": {
    ".": "./src/index.ts"
  }
}
================================================================
tsconfig.json
================================================================
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
================================================================
