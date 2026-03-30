// @paladin/scaffold-v3/scaffold/matchers/index.ts

import { bootstrapMatcher } from "./bootstrap"
import { drizzleMatcher } from "./drizzle"
import { barrelExportMatcher } from "./barrel-export"
import { routeRegistrationMatcher } from "./route-registration"
import type { Matcher } from "./types"

export const defaultMatchers: Matcher[] = [
  bootstrapMatcher,
  barrelExportMatcher,
  routeRegistrationMatcher,
  drizzleMatcher,
]

export type { Matcher, MatcherResult, PackageContext } from "./types"
