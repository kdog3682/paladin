import { type LanguageSpec } from '../types'
import { TXFLOW_APPEARANCE } from './appearance'
import { TXFLOW_EXTENSIONS } from './extensions'

export const TXFLOW: LanguageSpec = {
  appearance: TXFLOW_APPEARANCE,
  extensions: TXFLOW_EXTENSIONS,
  wrapLines: true,
  placeholder: 'start writing',
}
