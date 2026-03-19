export function decodeEscapedValue(value: string) {
  if (!value) return ''
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    if (i + 1 < value.length && value[i + 1] === '\\') {
      out += '\\'
      i += 1
      continue
    }
    if (
      i + 3 < value.length &&
      isOctal(value[i + 1]) &&
      isOctal(value[i + 2]) &&
      isOctal(value[i + 3])
    ) {
      const v =
        (value.charCodeAt(i + 1) - 48) * 64 +
        (value.charCodeAt(i + 2) - 48) * 8 +
        (value.charCodeAt(i + 3) - 48)
      out += String.fromCharCode(v)
      i += 3
      continue
    }
    out += '\\'
  }
  return out
}

function isOctal(ch: string) {
  return ch >= '0' && ch <= '7'
}
