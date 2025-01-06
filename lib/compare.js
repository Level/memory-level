'use strict'

module.exports = function compare (a, b) {
  // Only relevant when storeEncoding is 'utf8',
  // which guarantees that b is also a string.
  if (typeof a === 'string') {
    return a < b ? -1 : a > b ? 1 : 0
  }

  const length = Math.min(a.byteLength, b.byteLength)

  for (let i = 0; i < length; i++) {
    const cmp = a[i] - b[i]
    if (cmp !== 0) return cmp
  }

  return a.byteLength - b.byteLength
}
