// @paladin/package-management/templates/root.tpl
//
// Root monorepo scaffold. Sets up the top-level project structure.

================================================================
package.json
================================================================
{
  "name": "{{PROJECT_NAME}}",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {}
}
================================================================
.gitignore
================================================================
node_modules
dist
.env
.env.*
.DS_Store
*.db
*.db-journal
*.db-wal
*.db-shm
*.sqlite
*.sqlite-journal
*.sqlite-wal
*.sqlite-shm
================================================================
tsconfig.json
================================================================
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "paths": {
      "@{{PROJECT_NAME}}/*": ["./packages/*/src"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
================================================================
