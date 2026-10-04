/*
an html page of one example run: one row per item, its name and docstring on the
left and its picture on the right. pictures are linked through the api2 server's
/exemplar route (server.ts), not file://, so the page can be opened from anywhere.
  clip(gallery(report))
*/
import { relative } from "node:path"
import type { ExampleItem, ExampleReport } from "@paladin/exemplar"
import { CACHE_ROOT } from "@paladin/exemplar/snapshots"

const ORIGIN = `http://localhost:${process.env.PORT ?? 3000}`

function escape(text: string) {
  return text.replace(/[&<>"]/g, (char) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[char]};`)
}

export function pictureUrl(artifactPath: string) {
  return `${ORIGIN}/exemplar/${relative(CACHE_ROOT, artifactPath)}`
}

/* the picture when there is one, else whatever explains its absence */
function right(item: ExampleItem) {
  if (item.artifactPath) return `<img src="${escape(pictureUrl(item.artifactPath))}" alt="${escape(item.name)}">`
  const text = item.error ?? item.displayError ?? item.output
  return `<pre>${escape(text)}</pre>`
}

function row(item: ExampleItem) {
  return `<section class="item ${item.status}">
  <div class="left">
    <h2>${escape(item.name)} <span class="status">${item.status}</span></h2>
    ${item.desc ? `<p>${escape(item.desc)}</p>` : ""}
  </div>
  <div class="right">${right(item)}</div>
</section>`
}

const STYLE = `
body { margin: 0; padding: 24px; font: 14px/1.5 system-ui, sans-serif; background: #fafafa; color: #222; }
h1 { margin: 0 0 4px; font-size: 20px; }
h3 { margin: 24px 0 8px; font: 600 13px ui-monospace, monospace; color: #666; }
.item { display: grid; grid-template-columns: minmax(200px, 1fr) 2fr; gap: 24px; padding: 16px; margin-bottom: 12px; background: #fff; border: 1px solid #e4e4e4; border-radius: 6px; }
.item h2 { margin: 0 0 6px; font: 600 15px ui-monospace, monospace; }
.item p { margin: 0; white-space: pre-wrap; color: #444; }
.status { font: 11px system-ui, sans-serif; padding: 1px 6px; border-radius: 3px; background: #eee; color: #555; }
.changed .status { background: #fff3cd; color: #7a5b00; }
.error .status { background: #fde2e1; color: #a02020; }
.right img { max-width: 100%; display: block; }
.right pre { margin: 0; white-space: pre-wrap; font-size: 12px; }
`

export function gallery(report: ExampleReport): string {
  const files = report.files
    .map((file) => `<h3>${escape(file.relpath)}</h3>\n${file.items.map(row).join("\n")}`)
    .join("\n")
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escape(report.namespace)} examples</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escape(report.namespace)}</h1>
${files}
</body>
</html>
`
}
