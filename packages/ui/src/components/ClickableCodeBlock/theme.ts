import type { ThemeRegistrationRaw } from 'shiki'

// Colors lifted from the Claude Desktop dark palette (base + muted syntax).
const c = {
  bg: '#2f2f2d',
  bgCode: '#262624',
  fg: '#f5f4ef',
  fgDark: '#c1bfb5',
  fgGutter: '#6c6a60',
  comment: '#8a8780',
  border: '#4a4940',

  clay: '#d97757', // red
  kraft: '#d4a27f', // orange
  gold: '#c1a855', // yellow
  green: '#65bb30',
  mint: '#7ab89a',
  cyan: '#74abe2',
  blue: '#5b8ac4',
  purple: '#9b86f4',
  pink: '#cb775b',
  manilla: '#eadbbb',
}

export const claudeTheme: ThemeRegistrationRaw = {
  name: 'claude',
  type: 'dark',
  colors: {
    'editor.background': c.bgCode,
    'editor.foreground': c.fg,
  },
  bg: c.bgCode,
  fg: c.fg,
  tokenColors: [
    { scope: ['comment'], settings: { foreground: c.comment, fontStyle: 'italic' } },
    { scope: ['string', 'string.template'], settings: { foreground: c.gold } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character'], settings: { foreground: c.kraft } },
    { scope: ['keyword', 'storage.type', 'storage.modifier', 'keyword.control'], settings: { foreground: c.clay } },
    { scope: ['entity.name.function', 'support.function'], settings: { foreground: c.purple } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], settings: { foreground: c.cyan } },
    { scope: ['entity.name.tag'], settings: { foreground: c.clay } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: c.mint } },
    { scope: ['variable', 'variable.other'], settings: { foreground: c.fg } },
    { scope: ['variable.parameter'], settings: { foreground: c.manilla } },
    { scope: ['property', 'meta.property-name'], settings: { foreground: c.mint } },
    { scope: ['punctuation', 'meta.brace', 'meta.delimiter'], settings: { foreground: c.fgDark } },
    { scope: ['operator', 'keyword.operator'], settings: { foreground: c.pink } },
    { scope: ['module', 'entity.name.module', 'variable.other.constant'], settings: { foreground: c.blue } },
    { scope: ['invalid'], settings: { foreground: c.clay } },
  ],
}
