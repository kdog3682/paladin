import { Toaster } from "@paladin/shadcn"
import { toast as sonner } from "sonner"

export const toast = {
  info: (message: string) => sonner(message),
  warn: (message: string) => sonner.warning(message),
  error: (message: string) => sonner.error(message),
}

export function Toasts() {
  return <Toaster position="bottom-right" richColors closeButton />
}
