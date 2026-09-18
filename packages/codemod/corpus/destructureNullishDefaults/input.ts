/* src/button.ts */

type ButtonOpts = {
  size?: number
  width?: number
  color?: string
  label?: string
  gap?: number
  radius?: number
  weight?: number
  border?: number | null
  mode?: 'light' | 'dark'
  onClick?: () => void
  style?: { margin?: number }
}

type Props = { theme: { gap?: number } }

export function basic(opts: ButtonOpts) {
  const size = opts.size ?? 12
  return size
}

export function adjacent(opts: ButtonOpts) {
  const size = opts.size ?? 12
  const color = opts.color ?? 'black'
  const label = opts.label ?? `${size}px`
  return [size, color, label]
}

export function renamed(opts: ButtonOpts) {
  const fontSize = opts.size ?? 12
  return fontSize
}

export function sameStatement(opts: ButtonOpts) {
  const size = opts.size ?? 12, color = opts.color ?? 'black'
  return [size, color]
}

export function manyDefaults(opts: ButtonOpts) {
  const size = opts.size ?? 12
  const color = opts.color ?? 'black'
  const gap = opts.gap ?? 4
  const radius = opts.radius ?? 2
  const weight = opts.weight ?? 400
  return [size, color, gap, radius, weight]
}

export function mixedKinds(opts: ButtonOpts) {
  const size = opts.size ?? 12
  let color = opts.color ?? 'black'
  color = color.toUpperCase()
  return [size, color]
}

export function differentObjects(opts: ButtonOpts, fallback: ButtonOpts) {
  const size = opts.size ?? 12
  const color = fallback.color ?? 'black'
  return [size, color]
}

export function nestedObject(opts: ButtonOpts) {
  const style = opts.style ?? {}
  const margin = style.margin ?? 0
  return margin
}

export function chained(props: Props) {
  const gap = props.theme.gap ?? 8
  return gap
}

export function interrupted(opts: ButtonOpts) {
  const size = opts.size ?? 12
  const label = opts.label
  const color = opts.color ?? 'black'
  return [size, label, color]
}

export function withComments(opts: ButtonOpts) {
  // base size in px
  const size = opts.size ?? 12
  const color = opts.color ?? 'black' // any css color
  const gap = opts.gap ?? 4
  return [size, color, gap]
}

export class Chip {
  constructor(private opts: ButtonOpts) {}

  render() {
    const size = this.opts.size ?? 12
    const color = this.opts.color ?? 'black'
    return [size, color]
  }
}

export function ternaries(opts: ButtonOpts) {
  const size = opts.size !== undefined ? opts.size : 12
  const gap = opts.gap === undefined ? 4 : opts.gap
  const radius = opts.radius != null ? opts.radius : 2
  return [size, gap, radius]
}

export function flipped(opts: ButtonOpts) {
  const gap = undefined !== opts.gap ? opts.gap : 4
  return gap
}

export function orSafe(opts: ButtonOpts, noop: () => void) {
  const style = opts.style || {}
  const mode = opts.mode || 'light'
  const onClick = opts.onClick || noop
  return [style, mode, onClick]
}

export function orUnsafe(opts: ButtonOpts) {
  const size = opts.size || 12
  const color = opts.color || 'black'
  return [size, color]
}

export function mixedModes(opts: ButtonOpts) {
  const size = opts.size ?? 12
  const gap = opts.gap !== undefined ? opts.gap : 4
  const style = opts.style || {}
  return [size, gap, style]
}

export function ternaryEdges(opts: ButtonOpts, noop: () => void) {
  const border = opts.border != null ? opts.border : 1
  const weight = opts.weight !== null ? opts.weight : 400
  const label = opts.label ? opts.label : 'x'
  const onClick = opts.onClick ? opts.onClick : noop
  const width = opts.size !== undefined ? opts.width : 12
  return [border, weight, label, onClick, width]
}

export function multilineFallback(opts: ButtonOpts) {
  const onClick = opts.onClick ?? (() => {
    const gap = opts.gap ?? 4
    console.log(gap)
  })
  return onClick
}

export function skipped(opts: ButtonOpts, loose: any, maybe?: ButtonOpts) {
  const border = opts.border ?? 1
  const size = maybe?.size ?? 12
  const color: string = opts.color ?? 'black'
  const gap = loose.gap ?? 4
  const radius = opts.radius ?? opts.size ?? 2
  const weight = (opts.weight ?? 400)
  const label = opts['label'] ?? ''
  return [border, size, color, gap, radius, weight, label]
}
