import { Counter } from "./Counter"

export default {
  component: Counter,
  args: { label: "Clicks" },
}

export const Default = {}

export const StartsAtFive = {
  args: { start: 5 },
}

export const Increments = {
  play: async ({ canvas, userEvent, expect, step }: any) => {
    const button = canvas.getByRole("button")
    await step("starts at zero", () => expect(button).toHaveTextContent("Clicks: 0"))
    await step("click twice", async () => {
      await userEvent.click(button)
      await userEvent.click(button)
    })
    await step("counts both", () => expect(button).toHaveTextContent("Clicks: 2"))
  },
}

export function shorthand() {
  return <Counter label="Plain function" />
}

export const Steps = {
  steps: [
    { desc: "starts at zero", text: "button", equals: "Clicks: 0" },
    { click: "button" },
    { click: "button" },
    { desc: "both clicks counted", text: "button", equals: "Clicks: 2" },
    { eval: "document.querySelectorAll('button').length", equals: 1 },
  ],
}
