import { ALL_FACES } from "@mathpen/manim/src/fonts/types"
import { preloadFonts } from "@mathpen/manim/fonts-backend"

let loading: Promise<void> | null = null

/**
 * every face has two halves: the metrics json that layout reads (through the
 * browser fonts-backend) and the woff2 that fillText draws with. both are
 * served from /fonts, which vite.config.ts serves from mathpen/packages/web/public/fonts
 */
export function loadFonts(): Promise<void> {
  loading ??= Promise.all([
    preloadFonts(ALL_FACES),
    ...ALL_FACES.map(async (face) => {
      const i = face.lastIndexOf("-")
      const font = new FontFace(face, `url(/fonts/files/${face.slice(0, i)}/${face.slice(i + 1)}.woff2)`)
      document.fonts.add(font)
      await font.load()
    }),
  ]).then(
    () => {},
    (e) => {
      loading = null
      throw e
    },
  )
  return loading
}
