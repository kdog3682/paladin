export interface WireContext {
  webAppPath: string
  apiRoutesIndexPath: string
  appletsDir: string
}

export interface WirerResult {
  written?: string[] // newly created files
  modified?: string[] // existing files that were mutated
}

export interface Wirer {
  name: string
  match: (path: string) => boolean
  run: (
    paths: string[],
    ctx: WireContext,
  ) => Promise<WirerResult | void>
}

export interface ParamInfo {
  name: string
  tsType: string
  literalUnion?: string[]
}

export interface ExportedFn {
  name: string
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  route: string
  params: ParamInfo[]
  hasReturn: boolean
}
