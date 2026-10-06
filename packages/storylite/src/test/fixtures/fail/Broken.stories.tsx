import { Counter } from "../pass/Counter"

export default { component: Counter }

export const WrongText = {
  play: async ({ canvas, expect }: any) => {
    expect(canvas.getByRole("button")).toHaveTextContent("nope")
  },
}

export const Throws = {
  render: () => {
    throw new Error("boom")
  },
}

export const Fine = {}

export const BadStep = {
  steps: [
    { click: "button" },
    { desc: "this is wrong on purpose", text: "button", equals: "Count: 9" },
    { click: "button" },
  ],
}
