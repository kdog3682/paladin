export { defaultExtensions, type DefaultExtensionOptions } from './defaultExtensions'
export { BUILTIN_LANGUAGES, DEFAULT_LANGUAGE, type LanguageMap, type LanguageSpec } from './languages'
export { DEFAULT_FILE_ID, loadFromLocalStorage, saveToLocalStorage } from './persistence'
export { Editor, type EditorProps } from './components/editor'
export { type SerializedState, serializeEditorState } from './state'
// FONT_STACKS is here so a settings UI can enumerate the choices; FontKey alone
// is a type and disappears at runtime
export { FONT_STACKS, type FontKey } from './fonts'
