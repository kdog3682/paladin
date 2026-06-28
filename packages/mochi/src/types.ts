export type MochiCall = {
  source: string
  note: string | null
  isLog: boolean
}

export type MochiStory = {
  description: string | null
  context: string[]
  calls: MochiCall[]
}

export type MochiSection = {
  title: string | null
  stories: MochiStory[]
}

export type MochiFile = {
  path: string
  sections: MochiSection[]
}

export type MochiResult = {
  story: MochiStory
  value: unknown
  duration: number
  error: Error | null
}

export type MochiSectionResult = {
  title: string | null
  results: MochiResult[]
}

export type MochiSuiteResult = {
  path: string
  sections: MochiSectionResult[]
}
