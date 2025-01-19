'use strict'

const rangeOptions = new Set(['gt', 'gte', 'lt', 'lte'])

module.exports = function isRangeOption (k) {
  return rangeOptions.has(k)
}
