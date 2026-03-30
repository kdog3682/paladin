// @paladin/fcache/coerce.ts

type Serialized = { type: string; value: string }

export function serialize(val: unknown): Serialized {
  if (val === undefined) return { type: "undefined", value: "" }
  if (val === null) return { type: "null", value: "" }
  if (typeof val === "string") return { type: "string", value: val }
  if (typeof val === "number") return { type: "number", value: String(val) }
  if (typeof val === "boolean") return { type: "boolean", value: String(val) }
  if (val instanceof Buffer) return { type: "buffer", value: val.toString("base64") }
  if (val instanceof Uint8Array) return { type: "buffer", value: Buffer.from(val).toString("base64") }
  return { type: "json", value: JSON.stringify(val) }
}

export function deserialize({ type, value }: Serialized): unknown {
  switch (type) {
    case "undefined": return undefined
    case "null": return null
    case "string": return value
    case "number": return Number(value)
    case "boolean": return value === "true"
    case "buffer": return Buffer.from(value, "base64")
    case "json": return JSON.parse(value)
    default: return value
  }
}
