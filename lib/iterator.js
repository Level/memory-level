'use strict'

const {
  AbstractIterator,
  AbstractKeyIterator,
  AbstractValueIterator
} = require('abstract-level')

const compare = require('./compare')
const breathe = require('./breathe')

const kNone = Symbol('none')
const kIterator = Symbol('iterator')
const kLowerBound = Symbol('lowerBound')
const kUpperBound = Symbol('upperBound')
const kOutOfRange = Symbol('outOfRange')
const kReverse = Symbol('reverse')
const kOptions = Symbol('options')
const kTest = Symbol('test')
const kAdvance = Symbol('advance')
const kInit = Symbol('init')

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

class MemoryEntryIterator extends AbstractIterator {
  constructor (db, tree, options) {
    super(db, options)
    this[kInit](tree, options)
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
  constructor (db, tree, options) {
    super(db, options)
    this[kInit](tree, options)
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
  constructor (db, tree, options) {
    super(db, options)
    this[kInit](tree, options)
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

class MemoryClearIterator extends AbstractKeyIterator {
  constructor (db, tree, options) {
    super(db, options)
    this[kInit](tree, options)
  }

  // This is not an abstract-level API
  async visit (visitor) {
    const limit = this.limit
    const it = this[kIterator]

    let count = 0

    while (true) {
      for (let i = 0; i < 500; i++) {
        if (++count > limit) return
        if (!it.valid || !this[kTest](it.key)) return

        visitor(it.key)
        it[this[kAdvance]]()
      }

      // Some time to breathe
      await breathe()
    }
  }
}

for (const Ctor of [MemoryEntryIterator, MemoryKeyIterator, MemoryValueIterator, MemoryClearIterator]) {
  Ctor.prototype[kInit] = function (tree, options) {
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

exports.MemoryEntryIterator = MemoryEntryIterator
exports.MemoryKeyIterator = MemoryKeyIterator
exports.MemoryValueIterator = MemoryValueIterator
exports.MemoryClearIterator = MemoryClearIterator
