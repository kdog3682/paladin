import type { ApiClient } from '@paladin/utils/api'
import type { useAppStore } from './store'

export interface DocMeta {
  id: string
  title: string
}

export interface AppContext {
  api: ApiClient
  store: typeof useAppStore
  doc: () => DocMeta
}
