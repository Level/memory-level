'use strict'

const {
  AbstractLevel,
  AbstractIterator,
  AbstractKeyIterator,
  AbstractValueIterator,
  AbstractSnapshot
} = require('abstract-level')

const ModuleError = require('module-error')
const createRBT = require('functional-red-black-tree')

const rangeOptions = new Set(['gt', 'gte', 'lt', 'lte'])
const kNone = Symbol('none')
const kTree = Symbol('tree')
const kIterator = Symbol('iterator')
const kLowerBound = Symbol('lowerBound')
const kUpperBound = Symbol('upperBound')
const kOutOfRange = Symbol('outOfRange')
const kReverse = Symbol('reverse')
const kOptions = Symbol('options')
const kTest = Symbol('test')
const kAdvance = Symbol('advance')
const kInit = Symbol('init')

function compare (a, b) {
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

function gt (value) {
  return compare(value, this[kUpperBound]) > 0
}

function gte (value) {
  return compare(value, this[kUpperBound]) >= 0
}

function lt (value) {
  return compare(value, this[kUpperBound]) < 0
}

function lte (value) {
  return compare(value, this[kUpperBound]) <= 0
}

class MemoryIterator extends AbstractIterator {
  constructor (db, options) {
    super(db, options)
    this[kInit](db, options)
  }

  async _next () {
    if (!this[kIterator].valid) return undefined

    const key = this[kIterator].key
    const value = this[kIterator].value

    if (!this[kTest](key)) return undefined

    this[kIterator][this[kAdvance]]()
    return [key, value]
  }

  async _nextv (size, options) {
    const it = this[kIterator]
    const entries = []

    while (it.valid && entries.length < size && this[kTest](it.key)) {
      entries.push([it.key, it.value])
      it[this[kAdvance]]()
    }

    return entries
  }

  async _all (options) {
    const size = this.limit - this.count
    const it = this[kIterator]
    const entries = []

    while (it.valid && entries.length < size && this[kTest](it.key)) {
      entries.push([it.key, it.value])
      it[this[kAdvance]]()
    }

    return entries
  }
}

class MemoryKeyIterator extends AbstractKeyIterator {
  constructor (db, options) {
    super(db, options)
    this[kInit](db, options)
  }

  async _next () {
    if (!this[kIterator].valid) return undefined

    const key = this[kIterator].key
    if (!this[kTest](key)) return undefined

    this[kIterator][this[kAdvance]]()
    return key
  }

  async _nextv (size, options) {
    const it = this[kIterator]
    const keys = []

    while (it.valid && keys.length < size && this[kTest](it.key)) {
      keys.push(it.key)
      it[this[kAdvance]]()
    }

    return keys
  }

  async _all (options) {
    const size = this.limit - this.count
    const it = this[kIterator]
    const keys = []

    while (it.valid && keys.length < size && this[kTest](it.key)) {
      keys.push(it.key)
      it[this[kAdvance]]()
    }

    return keys
  }
}

class MemoryValueIterator extends AbstractValueIterator {
  constructor (db, options) {
    super(db, options)
    this[kInit](db, options)
  }

  async _next (options) {
    if (!this[kIterator].valid) return undefined

    const key = this[kIterator].key
    const value = this[kIterator].value

    if (!this[kTest](key)) return undefined

    this[kIterator][this[kAdvance]]()
    return value
  }

  async _nextv (size, options) {
    const it = this[kIterator]
    const values = []

    while (it.valid && values.length < size && this[kTest](it.key)) {
      values.push(it.value)
      it[this[kAdvance]]()
    }

    return values
  }

  async _all (options) {
    const size = this.limit - this.count
    const it = this[kIterator]
    const values = []

    while (it.valid && values.length < size && this[kTest](it.key)) {
      values.push(it.value)
      it[this[kAdvance]]()
    }

    return values
  }
}

for (const Ctor of [MemoryIterator, MemoryKeyIterator, MemoryValueIterator]) {
  Ctor.prototype[kInit] = function (db, options) {
    const tree = options.snapshot != null
      ? options.snapshot[kTree]
      : db[kTree]

    this[kReverse] = options.reverse
    this[kOptions] = options

    if (!this[kReverse]) {
      this[kAdvance] = 'next'
      this[kLowerBound] = 'gte' in options ? options.gte : 'gt' in options ? options.gt : kNone
      this[kUpperBound] = 'lte' in options ? options.lte : 'lt' in options ? options.lt : kNone

      if (this[kLowerBound] === kNone) {
        this[kIterator] = tree.begin
      } else if ('gte' in options) {
        this[kIterator] = tree.ge(this[kLowerBound])
      } else {
        this[kIterator] = tree.gt(this[kLowerBound])
      }

      if (this[kUpperBound] !== kNone) {
        this[kTest] = 'lte' in options ? lte : lt
      }
    } else {
      this[kAdvance] = 'prev'
      this[kLowerBound] = 'lte' in options ? options.lte : 'lt' in options ? options.lt : kNone
      this[kUpperBound] = 'gte' in options ? options.gte : 'gt' in options ? options.gt : kNone

      if (this[kLowerBound] === kNone) {
        this[kIterator] = tree.end
      } else if ('lte' in options) {
        this[kIterator] = tree.le(this[kLowerBound])
      } else {
        this[kIterator] = tree.lt(this[kLowerBound])
      }

      if (this[kUpperBound] !== kNone) {
        this[kTest] = 'gte' in options ? gte : gt
      }
    }
  }

  Ctor.prototype[kTest] = function () {
    return true
  }

  Ctor.prototype[kOutOfRange] = function (target) {
    if (!this[kTest](target)) {
      return true
    } else if (this[kLowerBound] === kNone) {
      return false
    } else if (!this[kReverse]) {
      if ('gte' in this[kOptions]) {
        return compare(target, this[kLowerBound]) < 0
      } else {
        return compare(target, this[kLowerBound]) <= 0
      }
    } else {
      if ('lte' in this[kOptions]) {
        return compare(target, this[kLowerBound]) > 0
      } else {
        return compare(target, this[kLowerBound]) >= 0
      }
    }
  }

  Ctor.prototype._seek = function (target, options) {
    if (this[kOutOfRange](target)) {
      this[kIterator] = this[kIterator].tree.end
      this[kIterator].next()
    } else if (this[kReverse]) {
      this[kIterator] = this[kIterator].tree.le(target)
    } else {
      this[kIterator] = this[kIterator].tree.ge(target)
    }
  }
}

class MemoryLevel extends AbstractLevel {
  constructor (location, options) {
    // Take a dummy location argument to align with other implementations
    if (typeof location === 'object' && location !== null) {
      options = location
    }

    let { storeEncoding, ...forward } = options || {}
    storeEncoding = storeEncoding || 'buffer'

    // Our compare() function supports Buffer, Uint8Array and strings
    if (!['buffer', 'view', 'utf8'].includes(storeEncoding)) {
      throw new ModuleError("The storeEncoding option must be 'buffer', 'view' or 'utf8'", {
        code: 'LEVEL_ENCODING_NOT_SUPPORTED'
      })
    }

    super({
      seek: true,
      explicitSnapshots: true,
      permanence: false,
      createIfMissing: false,
      errorIfExists: false,
      encodings: { [storeEncoding]: true },
      signals: {
        // Would have no value here because the operations are synchronous
        iterators: false
      }
    }, forward)

    this[kTree] = createRBT(compare)
  }

  async _put (key, value, options) {
    const it = this[kTree].find(key)

    if (it.valid) {
      this[kTree] = it.update(value)
    } else {
      this[kTree] = this[kTree].insert(key, value)
    }
  }

  async _get (key, options) {
    const tree = options.snapshot != null
      ? options.snapshot[kTree]
      : this[kTree]

    // Is undefined if not found
    return tree.get(key)
  }

  async _getMany (keys, options) {
    const tree = options.snapshot != null
      ? options.snapshot[kTree]
      : this[kTree]

    return keys.map(getFromThis, tree)
  }

  async _del (key, options) {
    this[kTree] = this[kTree].remove(key)
  }

  async _batch (operations, options) {
    let tree = this[kTree]

    for (const op of operations) {
      const key = op.key
      const it = tree.find(key)

      if (op.type === 'put') {
        tree = it.valid ? it.update(op.value) : tree.insert(key, op.value)
      } else {
        tree = it.remove()
      }
    }

    this[kTree] = tree
  }

  async _clear (options) {
    if (options.limit === -1 && !Object.keys(options).some(isRangeOption) && !options.snapshot) {
      // Delete everything by creating a new empty tree.
      this[kTree] = createRBT(compare)
      return
    }

    const iterator = this._keys({ ...options })
    const limit = iterator.limit

    let count = 0

    while (true) {
      // TODO: add option to control "batch size"
      for (let i = 0; i < 500; i++) {
        if (++count > limit) return
        if (!iterator[kIterator].valid) return
        if (!iterator[kTest](iterator[kIterator].key)) return

        // Must also include changes made in parallel to clear()
        this[kTree] = this[kTree].remove(iterator[kIterator].key)
        iterator[kIterator][iterator[kAdvance]]()
      }

      // Some time to breathe
      await breathe()
    }
  }

  _iterator (options) {
    return new MemoryIterator(this, options)
  }

  _keys (options) {
    return new MemoryKeyIterator(this, options)
  }

  _values (options) {
    return new MemoryValueIterator(this, options)
  }

  _snapshot (options) {
    return new MemorySnapshot(this[kTree], options)
  }
}

class MemorySnapshot extends AbstractSnapshot {
  constructor (tree, options) {
    super(options)
    this[kTree] = tree
  }
}

exports.MemoryLevel = MemoryLevel

let breathe

// Use setImmediate() in Node.js to allow IO in between work
if (typeof process !== 'undefined' && !process.browser && typeof global !== 'undefined' && typeof global.setImmediate === 'function') {
  const setImmediate = global.setImmediate

  breathe = function () {
    return new Promise(setImmediate)
  }
} else {
  breathe = async function () {}
}

function getFromThis (key) {
  return this.get(key)
}

function isRangeOption (k) {
  return rangeOptions.has(k)
}
