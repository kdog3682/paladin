export { Editor, type EditorProps } from './components/editor'
export { defaultExtensions, type DefaultExtensionOptions } from './extensions'
export { BUILTIN_LANGUAGES, type LanguageMap, type LanguageSpec } from './languages'
export { type SerializedState, serializeEditorState } from './state'
// FONT_STACKS is here so a settings UI can enumerate the choices; FontKey alone
// is a type and disappears at runtime
export { FONT_STACKS, type FontKey } from './fonts'
