// @paladin/stamp/stamp.demo.ts

const mod = await import("./stamp.mochi")

for (const [name, fn] of Object.entries(mod)) {
  if (typeof fn !== "function") continue
  console.log(`\n> ${name}`)
  console.log(fn())
}
