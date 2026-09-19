/** Opens `url` in the system default browser. Fire-and-forget — spawns a detached python3 `webbrowser.open` call and does not wait for it. */
export function openInBrowser(url: string) {
  Bun.spawn(['python3', '-c', `import webbrowser; webbrowser.open('${url}')`])
}
