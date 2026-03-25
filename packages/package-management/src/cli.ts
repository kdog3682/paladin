// @paladin/package-management/cli.ts

import { parseArgs } from "util"
import { PackageManager } from "./package-management"

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    root: { type: "string", default: process.cwd() },
    project: { type: "string", default: "paladin" },
    force: { type: "boolean", default: false },
    recreate: { type: "boolean", default: true },
    linked: { type: "boolean" },
    solo: { type: "boolean", default: false },
    version: { type: "string", default: "latest" },
  },
})

const [command, ...rawArgs] = positionals

function normalizePkg(name: string): string {
  if (name.startsWith("@")) return name
  const short = name.replace(new RegExp(`^${values.project!}/`), "")
  return `@${values.project!}/${short}`
}

const args = rawArgs.map(normalizePkg)

const pm = new PackageManager({
  root: values.root!,
  projectName: values.project!,
})

function parseVersion(v: string): "latest" | "oldest" | `v${number}` {
  if (v === "latest" || v === "oldest") return v
  if (/^v?\d+$/.test(v)) return `v${parseInt(v.replace(/^v/, ""), 10)}` as `v${number}`
  throw new Error(`Invalid version: ${v}`)
}

async function main() {
  switch (command) {
    case "init": {
      const files = await pm.initRepo()
      console.log(`Initialized repo (${files.length} files)`)
      break
    }

    case "create": {
      if (!args[0]) throw new Error("Usage: paladin create <package-name>")
      const files = await pm.createPackage(args[0])
      console.log(`Created ${args[0]} (${files.length} files)`)
      break
    }

    case "deprecate": {
      if (args.length === 0) throw new Error("Usage: paladin deprecate <pkg1> [pkg2] [--force] [--recreate]")
      await pm.deprecatePackages(args, {
        force: values.force,
        recreate: values.recreate,
      })
      console.log(`Deprecated: ${args.join(", ")}${values.recreate ? " (recreated)" : ""}`)
      break
    }

    case "retrieve": {
      if (!args[0]) throw new Error("Usage: paladin retrieve <package-name> [--version v1]")
      const snapshot = await pm.retrievePackage(args[0], parseVersion(values.version!))
      console.log(JSON.stringify(snapshot, null, 2))
      break
    }

    case "inspect": {
      if (!args[0]) throw new Error("Usage: paladin inspect <package-name> [--version v1]")
      const meta = await pm.inspectPackage(args[0], parseVersion(values.version!))
      console.log(JSON.stringify(meta, null, 2))
      break
    }

    case "list": {
      const deprecated = await pm.listDeprecated()
      if (deprecated.length === 0) {
        console.log("No deprecated packages found.")
      } else {
        for (const d of deprecated) {
          const versions = d.versions.map(v => `v${v}`).join(", ")
          console.log(`${d.packageName} [${versions}] group: ${d.latestGroup.join(", ")}`)
        }
      }
      break
    }

    case "restore": {
      if (args.length === 0) throw new Error("Usage: paladin restore <pkg1> [--version v1] [--linked|--solo]")

      let linked: boolean | undefined
      if (values.linked) linked = true
      else if (values.solo) linked = false

      await pm.restorePackages(args, parseVersion(values.version!), { linked })
      console.log(`Restored: ${args.join(", ")}`)
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      console.error("Commands: init, create, deprecate, retrieve, inspect, list, restore")
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
