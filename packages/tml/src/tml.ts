const PLUS = "+"
const MINUS = "-"
const DIV = "÷"
const EXP = "^"
const EQ = "="
const FRAC = "/"
const TIMES = "×" // default times sign
const TIMES_DOT = "·" // used when the expression contains x
// dot alternatives to swap into TIMES_DOT:
//   "∙"  bullet operator
//   "⋅"  dot operator
//   "•"  bullet
//   "*"  asterisk

const VARS = new Set(["a", "b", "c", "x", "y", "z"])

const isDigit = (c: string) => c >= "0" && c <= "9"

export function tml(str: string): string {
  const times = str.includes("x") ? TIMES_DOT : TIMES
  let out = ""
  let prev = "start" // start | var | digit | caret | sign | op | open | close
  let i = 0

  while (i < str.length) {
    const c = str[i]

    // number run: a number following a variable is an exponent
    if (isDigit(c)) {
      let n = ""
      while (i < str.length && isDigit(str[i])) {
        n += str[i]
        i++
      }
      if (prev === "var") out += EXP
      out += n
      prev = "digit"
      continue
    }

    // ee -> append M zeroes ; e -> exponent
    if (c === "e") {
      if (str[i + 1] === "e") {
        i += 2
        let m = ""
        while (i < str.length && isDigit(str[i])) {
          m += str[i]
          i++
        }
        out += "0".repeat(Number(m))
        prev = "digit"
        continue
      }
      out += EXP
      prev = "caret"
      i++
      continue
    }

    if (VARS.has(c)) {
      out += c
      prev = "var"
      i++
      continue
    }

    if (c === "p") {
      out += ` ${PLUS} `
      prev = "op"
      i++
      continue
    }

    if (c === "d") {
      out += ` ${DIV} `
      prev = "op"
      i++
      continue
    }

    if (c === "t") {
      out += ` ${times} `
      prev = "op"
      i++
      continue
    }

    // minus after an exponent is a sign, otherwise subtraction
    if (c === "-") {
      if (prev === "caret") {
        out += MINUS
        prev = "sign"
      } else {
        out += ` ${MINUS} `
        prev = "op"
      }
      i++
      continue
    }

    // trailing = becomes "= ?"
    if (c === "=") {
      out += i === str.length - 1 ? ` ${EQ} ?` : ` ${EQ} `
      prev = "op"
      i++
      continue
    }

    if (c === FRAC) {
      out += FRAC
      prev = "op"
      i++
      continue
    }

    if (c === EXP) {
      out += EXP
      prev = "caret"
      i++
      continue
    }

    if (c === "[" || c === "(") {
      out += c
      prev = "open"
      i++
      continue
    }

    if (c === "]" || c === ")") {
      out += c
      prev = "close"
      i++
      continue
    }

    out += c
    i++
  }

  return out.replace(/ {2,}/g, " ").trim()
}
