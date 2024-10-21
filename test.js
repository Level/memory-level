'use strict'

const test = require('tape')
const suite = require('abstract-level/test')
const { MemoryLevel } = require('.')
const { Buffer } = require('buffer')

// Test abstract-level compliance
suite({
  test,
  factory: (...args) => new MemoryLevel(...args)
})

// Test with custom store encodings
for (const storeEncoding of ['view', 'utf8']) {
  suite({
    test,
    factory (options) {
      return new MemoryLevel({ ...options, storeEncoding })
    }
  })
}

// Additional tests for this implementation of abstract-level
test('iterator does not clone buffers', async function (t) {
  const db = new MemoryLevel({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
  const buf = Buffer.from('a')

  await db.open()
  await db.put(buf, buf)

  const entries = await db.iterator().all()
  t.is(entries[0][0], buf, 'key is same buffer')
  t.is(entries[0][1], buf, 'value is same buffer')
})

test('throws on unsupported storeEncoding', function (t) {
  t.throws(() => new MemoryLevel({ storeEncoding: 'foo' }), (err) => err.code === 'LEVEL_ENCODING_NOT_SUPPORTED')
  t.end()
})
