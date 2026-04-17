import { useState } from "react"
import {
  Button,
  Input,
  Label,
  Card,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@bklearn/shadcn"

export type ParamType =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "object"
  | "array"

export interface EndpointParam {
  name: string
  type: ParamType
  options?: string[] // for 'enum'
}

export interface Endpoint {
  name: string
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  route: string
  params: EndpointParam[]
}

export interface DemoAppletProps {
  feature: string
  endpoints: Endpoint[]
}

type RunResult = { endpoint: string; data: unknown } | null

export function DemoApplet({ feature, endpoints }: DemoAppletProps) {
  const [result, setResult] = useState<RunResult>(null)

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold capitalize">{feature}</h2>
      {endpoints.map((ep) => (
        <EndpointCard
          key={ep.name}
          feature={feature}
          endpoint={ep}
          onResult={setResult}
        />
      ))}
      {result && (
        <Card className="p-3">
          <div className="text-xs text-muted-foreground mb-1">
            {result.endpoint}
          </div>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  )
}

interface EndpointCardProps {
  feature: string
  endpoint: Endpoint
  onResult: (r: RunResult) => void
}

function EndpointCard({
  feature,
  endpoint,
  onResult,
}: EndpointCardProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialValues(endpoint.params),
  )
  const [loading, setLoading] = useState(false)

  const set = (name: string, v: unknown) =>
    setValues((s) => ({ ...s, [name]: v }))

  async function run() {
    setLoading(true)
    try {
      const payload = serializePayload(endpoint.params, values)
      const isQuery =
        endpoint.method === "GET" || endpoint.method === "DELETE"
      const url = `/${feature}${endpoint.route}`

      const res = isQuery
        ? await fetch(
            `${url}?${new URLSearchParams(payload as Record<string, string>).toString()}`,
          )
        : await fetch(url, {
            method: endpoint.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })

      const data = await res.json()
      onResult({ endpoint: `${endpoint.method} ${url}`, data })
    } catch (err) {
      onResult({
        endpoint: `${endpoint.method} /${feature}${endpoint.route}`,
        data: { error: String(err) },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-3 flex flex-col gap-3">
      <div className="font-medium text-sm">
        {endpoint.method} {endpoint.route} — {endpoint.name}
      </div>
      {endpoint.params.map((p) => (
        <ParamField
          key={p.name}
          param={p}
          value={values[p.name]}
          onChange={(v) => set(p.name, v)}
        />
      ))}
      <Button size="sm" onClick={run} disabled={loading}>
        {loading ? "Running..." : "Run"}
      </Button>
    </Card>
  )
}

interface ParamFieldProps {
  param: EndpointParam
  value: unknown
  onChange: (v: unknown) => void
}

function ParamField({ param, value, onChange }: ParamFieldProps) {
  const label = <Label className="text-xs">{param.name}</Label>

  switch (param.type) {
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          {label}
          <Switch checked={!!value} onCheckedChange={onChange} />
        </div>
      )
    case "number":
      return (
        <div className="flex flex-col gap-1">
          {label}
          <Input
            type="number"
            value={value as number}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      )
    case "enum":
      return (
        <div className="flex flex-col gap-1">
          {label}
          <Select value={value as string} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(param.options ?? []).map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    case "object":
    case "array":
      return (
        <div className="flex flex-col gap-1">
          {label}
          <Textarea
            placeholder="JSON"
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    default:
      return (
        <div className="flex flex-col gap-1">
          {label}
          <Input
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
  }
}

function initialValues(
  params: EndpointParam[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of params) {
    switch (p.type) {
      case "boolean":
        out[p.name] = false
        break
      case "number":
        out[p.name] = 0
        break
      case "enum":
        out[p.name] = p.options?.[0] ?? ""
        break
      default:
        out[p.name] = ""
    }
  }
  return out
}

function serializePayload(
  params: EndpointParam[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of params) {
    const v = values[p.name]
    if (p.type === "object" || p.type === "array") {
      try {
        out[p.name] = v ? JSON.parse(v as string) : undefined
      } catch {
        out[p.name] = v
      }
    } else {
      out[p.name] = v
    }
  }
  return out
}

export default DemoApplet
