var path = require('path')
var orm = require('orm')

var MigrateTask = require('migrate-orm2')

var CONFIG_DIR = path.join(process.env.HOME, '.dropzone')
var DB_URL = 'sqlite://' + path.join(CONFIG_DIR, 'cache.db')

var cache = orm.connect(DB_URL)

cache.ready = function (next) {
  var task = new MigrateTask(cache.driver)
  task.up(function () {
    cache.sync(next)
  })
}

cache.define('Tx', {
  id: {
    type: 'serial',
    key: true
  },
  txId: {
    type: 'text',
    mapsTo: 'txid'
  },
  receiverAddr: {
    type: 'text',
    mapsTo: 'receiver_addr'
  },
  senderAddr: {
    type: 'text',
    mapsTo: 'sender_addr'
  },
  data: Buffer,
  isTesting: {
    type: 'boolean',
    mapsTo: 'is_testing'
  },
  blockId: {
    type: 'text',
    mapsTo: 'blockid'
  },
  blockHeight: {
    type: 'integer',
    mapsTo: 'block_height'
  }
}, {
  collection: 'transactions'
})

cache.define('CommKey', {
  id: {
    type: 'serial',
    key: true
  },
  receiverAddr: {
    type: 'text',
    mapsTo: 'receiver_addr'
  },
  senderAddr: {
    type: 'text',
    mapsTo: 'sender_addr'
  },
  secret: {
    type: 'text',
    mapsTo: 'secret'
  }
}, {
  collection: 'communication_keys'
})

cache.define('Chat', {
  id: {
    type: 'serial',
    key: true
  },
  sessionId: {
    type: 'text',
    mapsTo: 'session_txid'
  },
  readMessages: {
    type: 'integer',
    mapsTo: 'last_read_message_count'
  }
}, {
  collection: 'chats'
})

module.exports = cache