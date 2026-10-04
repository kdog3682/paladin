================================================================
package.json
================================================================
{
  "name": "@{{PROJECT_NAME}}/{{PACKAGE_NAME}}",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test --preload ./happydom.ts"
  },
  "dependencies": {
    "lucide-react": "^0.563.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@happy-dom/global-registrator": "^20.0.10",
    "@types/bun": "latest",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "react": "^18",
    "react-dom": "^18"
  }
}

================================================================
tsconfig.json
================================================================
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "Preserve",
    "types": ["bun"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src", "happydom.ts"]
}

================================================================
happydom.ts
================================================================
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register()
