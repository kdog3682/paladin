// external import
import { useState } from "react"

/**
 * Props for the CommandPicker component.
 */
export type PickerProps = {
  /** Where the menu renders relative to the trigger. */
  placement?: "above" | "below"

  // how descriptions are laid out
  // one of a few string options
  descriptionLayout?: "inline" | "stacked"

  /** Extra class names. */
  className?: string
}

// Defaults pulled from a destructuring assignment in the body.
export function CommandPicker(props: PickerProps) {
  const {
    placement = "below",
    descriptionLayout = "inline",
    className,
  } = props

  const [open, setOpen] = useState(false)

  return null
}

// A component exported as the module default.
export default function Empty() {
  return null
}
