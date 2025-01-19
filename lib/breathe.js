'use strict'

// Use setImmediate() in Node.js to allow IO in between work
if (typeof process !== 'undefined' && !process.browser && typeof global !== 'undefined' && typeof global.setImmediate === 'function') {
  const setImmediate = global.setImmediate

  module.exports = function breathe () {
    return new Promise(setImmediate)
  }
} else {
  module.exports = async function breathe () { }
}
