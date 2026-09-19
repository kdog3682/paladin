/* src/models/address.ts */

export interface Address {
  street: string
  city: string
}

/* src/models/user.ts */

export interface User {
  id: string
  name: string
}

/* src/api/user.ts */

import type { Address } from "../models/address"

export type User = {
  id: string
  name: string
  address?: Address
}

export function toUser(raw: { id: string; name: string }): User {
  return { id: raw.id, name: raw.name }
}

/* src/billing/types.ts */

export type BillingAddress = {
  street: string
  city: string
}

export type Invoice = {
  id: string
  to: BillingAddress
  total: number
}

/* src/billing/index.ts */

export { BillingAddress, Invoice } from "./types"

/* src/mail/envelope.ts */

export type Envelope = {
  street: string
  city: string
}

export const SENDER = "acme"

/* src/mail/label.ts */

import type { Envelope } from "./envelope"

export const MAIL = "mail"

/* src/shipping.ts */

import type { Address } from "./models/address"
import type { User } from "./models/user"

export function label(user: User, to: Address) {
  return `${user.name}, ${to.street}, ${to.city}`
}

/* src/models/size.ts */

export interface Size {
  width: number
  height: number
}

/* src/ui/frame.ts */

export type Frame = {
  width: number
  height: number
}

/* src/ui/index.ts */

export * from "./frame"

/* src/ui/card.ts */

type Props = {
  id: string
  name: string
}

export function card(props: Props) {
  return props.name
}
