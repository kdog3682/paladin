// @paladin/storylite/src/react/vite-plugin.ts

import type { Plugin } from "vite"
import type { StoryModule } from "./types"
import { resolve } from "path"

const VIRTUAL_ID = "virtual:storylite"
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID

export function storylitePlugin(storyModules: StoryModule[]): Plugin {
  return {
    name: "storylite",

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      return null
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null
      return generateVirtualModule(storyModules)
    },

    configureServer(server) {
      server.middlewares.use("/__storylite", (req, res) => {
        const [, fileIndex, exportName] = (req.url ?? "").split("/").filter(Boolean)
        const moduleIndex = parseInt(fileIndex, 10)
        const storyModule = storyModules[moduleIndex]

        if (!storyModule || !exportName) {
          res.statusCode = 404
          res.end("Story not found")
          return
        }

        const absPath = resolve(storyModule.filePath)

        res.setHeader("Content-Type", "text/html")
        res.end(renderShell(absPath, exportName))
      })
    },
  }
}

function generateVirtualModule(storyModules: StoryModule[]): string {
  const imports = storyModules
    .map((m, i) => `import * as mod_${i} from "${resolve(m.filePath)}"`)
    .join("\n")

  const entries = storyModules
    .map((m, i) => {
      const stories = m.stories
        .map((s) => `"${s.exportName}": mod_${i}["${s.exportName}"]`)
        .join(", ")
      return `"${m.filePath}": { meta: mod_${i}.default, stories: { ${stories} } }`
    })
    .join(",\n  ")

  return `${imports}\n\nexport const registry = {\n  ${entries}\n}\n`
}

function renderShell(absPath: string, exportName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React from "react"
    import { createRoot } from "react-dom/client"
    import * as storyModule from "${absPath}"

    const meta = storyModule.default || {}
    const story = storyModule["${exportName}"]
    const Component = meta.component

    function markReady(el) {
      const root = document.getElementById("root")
      const wrapper = document.createElement("div")
      wrapper.setAttribute("data-storylite-root", "true")
      wrapper.setAttribute("data-storylite-ready", "true")
      root.appendChild(wrapper)
      createRoot(wrapper).render(el)
    }

    if (!story) {
      markReady(React.createElement("div", null, "Story not found: ${exportName}"))
      throw new Error("Missing story export: ${exportName}")
    }

    // resolve args — CSF2 attaches .args on the function, CSF3 has them in object
    const args = (typeof story === "function" ? story.args : story.args) || {}

    // resolve render function
    // CSF3 object with render: story.render
    // CSF2/1 function: the export itself is the render fn
    // fallback: createElement(Component, args)
    let renderFn
    if (typeof story === "function") {
      renderFn = story
    } else if (typeof story === "object" && typeof story.render === "function") {
      renderFn = story.render
    } else if (Component) {
      renderFn = (props) => React.createElement(Component, props)
    } else {
      markReady(React.createElement("div", null, "No component or render function"))
      throw new Error("Cannot render: ${exportName}")
    }

    // collect decorators
    const fileDecorators = meta.decorators || []
    const storyDecorators = (typeof story === "object" ? story.decorators : story.decorators) || []
    const decorators = [...storyDecorators, ...fileDecorators]

    // render the story
    let rendered = renderFn(args)

    // apply decorators inside-out
    for (const decorator of decorators.reverse()) {
      const inner = rendered
      rendered = decorator(() => inner)
    }

    markReady(rendered)
  </script>
</body>
</html>`
}
