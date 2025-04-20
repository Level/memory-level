'use strict'

const { AbstractLevel, AbstractSnapshot } = require('abstract-level')
const ModuleError = require('module-error')
const createRBT = require('functional-red-black-tree')
const { MemoryEntryIterator } = require('./lib/iterator')
const { MemoryKeyIterator, MemoryValueIterator } = require('./lib/iterator')
const { MemoryClearIterator } = require('./lib/iterator')
const compare = require('./lib/compare')
const isRangeOption = require('./lib/is-range-option')

const kTree = Symbol('tree')

class MemoryLevel extends AbstractLevel {
  #tree

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
      has: true,
      getSync: true,
      encodings: { [storeEncoding]: true },
      signals: {
        // Would have no value here because the operations are synchronous
        iterators: false
      }
    }, forward)

    this.#tree = createRBT(compare)
  }

  async _put (key, value, options) {
    const it = this.#tree.find(key)

    if (it.valid) {
      this.#tree = it.update(value)
    } else {
      this.#tree = this.#tree.insert(key, value)
    }
  }

  async _get (key, options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return tree.get(key)
  }

  _getSync (key, options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return tree.get(key)
  }

  async _getMany (keys, options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return keys.map(get, tree)
  }

  async _has (key, options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return tree.get(key) !== undefined
  }

  async _hasMany (keys, options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return keys.map(has, tree)
  }

  async _del (key, options) {
    this.#tree = this.#tree.remove(key)
  }

  async _batch (operations, options) {
    let tree = this.#tree

    for (const op of operations) {
      const key = op.key
      const it = tree.find(key)

      if (op.type === 'put') {
        tree = it.valid ? it.update(op.value) : tree.insert(key, op.value)
      } else {
        tree = it.remove()
      }
    }

    this.#tree = tree
  }

  async _clear (options) {
    if (options.limit === -1 && !Object.keys(options).some(isRangeOption) && options.snapshot == null) {
      // Delete everything by creating a new empty tree.
      this.#tree = createRBT(compare)
      return
    }

    const tree = options.snapshot?.[kTree] ?? this.#tree
    const iterator = new MemoryClearIterator(this, tree, options)

    try {
      await iterator.visit(this.#clearKey)
    } finally {
      await iterator.close()
    }
  }

  #clearKey = (key) => {
    // Must also include changes made in parallel to clear()
    this.#tree = this.#tree.remove(key)
  }

  _iterator (options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return new MemoryEntryIterator(this, tree, options)
  }

  _keys (options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return new MemoryKeyIterator(this, tree, options)
  }

  _values (options) {
    const tree = options.snapshot?.[kTree] ?? this.#tree
    return new MemoryValueIterator(this, tree, options)
  }

  _snapshot (options) {
    return new MemorySnapshot(this.#tree, options)
  }
}

class MemorySnapshot extends AbstractSnapshot {
  constructor (tree, options) {
    super(options)
    this[kTree] = tree
  }
}

exports.MemoryLevel = MemoryLevel

function get (key) {
  return this.get(key)
}

function has (key) {
  return this.get(key) !== undefined
}
