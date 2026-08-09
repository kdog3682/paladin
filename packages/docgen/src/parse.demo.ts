import { clip } from "@paladin/utils/clip"
import { parse } from "./parse"

const fixture = `${import.meta.dir}/parse.fixture.ts`

await clip(await parse(fixture))
