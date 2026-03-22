// @paladin/scribe-api/src/state.ts

class AppState {
  private static instance: AppState

  projectDir = ""
  recentFiles: string[] = []

  private constructor() {}

  static get(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }
}

export const appState = AppState.get()
