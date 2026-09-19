/* src/models/address.ts */

/// unchanged: canonical for the { street, city } shape (exported, most referenced)
export interface Address {
  street: string
  city: string
}

/* src/models/user.ts */

/// import copied over along with the widened field
import type { Address } from "./address"

/// canonical User: more references than src/api/user.ts's User
export interface User {
  id: string
  name: string
  /// added from src/api/user.ts's User. optional because not every User had it
  address?: Address
}

/* src/api/user.ts */

/// the local User was folded into models/user, so the Address import went unused
/// and was dropped. import may land in a slightly different spot
import type { User } from "../models/user"

export function toUser(raw: { id: string; name: string }): User {
  return { id: raw.id, name: raw.name }
}

/* src/billing/types.ts */

/// added when `to: BillingAddress` was retargeted to Address
import type { Address } from "../models/address"

/// BillingAddress had the exact shape of Address, so it folded into it.
/// ./index re-exports the name, so it stays as a forward instead of being deleted
export type { Address as BillingAddress } from "../models/address"

export type Invoice = {
  id: string
  /// was: to: BillingAddress
  to: Address
  total: number
}

/* src/billing/index.ts */

/// unchanged: BillingAddress still resolves, now through the forward
export { BillingAddress, Invoice } from "./types"

/* src/shipping.ts */

/// unchanged
import type { Address } from "./models/address"
import type { User } from "./models/user"

export function label(user: User, to: Address) {
  return `${user.name}, ${to.street}, ${to.city}`
}

/* src/ui/card.ts */

/// unchanged: same shape as models/user's original User, but Props is local
/// local types only dedupe within their own file, so pass 1 leaves it alone
type Props = {
  id: string
  name: string
}

export function card(props: Props) {
  return props.name
}
