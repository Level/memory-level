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

test('clear() waits a tick every 500 items', async function (t) {
  const db = new MemoryLevel()
  const batch = Array(1000)

  for (let i = 0; i < batch.length; i++) {
    batch[i] = { type: 'put', key: i, value: i }
  }

  await db.open()
  await db.batch(batch)

  t.is((await db.keys().all()).length, batch.length)

  // This just checks that the code runs OK, not that it waits a
  // tick (TODO). Pass in a limit in order to use an iterator
  // instead of the fast-path of clear() that just deletes all.
  await db.clear({ limit: batch.length * 2 })

  t.is((await db.keys().all()).length, 0)
  return db.close()
})
