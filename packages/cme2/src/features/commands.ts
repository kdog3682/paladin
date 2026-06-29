import type { Feature } from './types'

// placeholder side-effect helpers
declare function gitCommit(message: string, cwd: string): Promise<void>
declare function claude(prompt: string): Promise<string>
declare function formatDoc(view: import('@codemirror/view').EditorView): void

export const commandsFeature: Feature = {
  name: 'commands',
  commands: [
    {
      key: 'git commit',
      abbr: 'gc',
      args: [
        {
          name: 'message',
          optional: true,
          freeform: true,
          fallback: (ctx) => claude(`write a commit message for ${ctx.cwd}`),
        },
      ],
      run: (ctx, message: string) => gitCommit(message, ctx.cwd),
    },
    {
      key: 'prettier',
      desc: 'format the current document',
      run: (ctx) => formatDoc(ctx.editor), // <- reaches into the editor
    },
    {
      key: 'view',
      desc: 'combine files in the active dir into the popup',
      run: (ctx) => ctx.setPopup(ctx.api.run('combineFiles', ctx.activeDir)),
    },
    {
      key: 'note',
      args: [{ name: 'text', freeform: true }], // type anything, press enter
      run: (ctx, text: string) => ctx.api.post('/note', { text }),
    },
    {
      key: 'fruity-example',
      args: [
        { options: ['apple', 'banana', 'orange'] },
        { options: ['pears', 'strawberries'] },
      ],
      run: (ctx, a: string, b: string) => ctx.setPopup(`${a} + ${b}`),
    },
  ],
}
