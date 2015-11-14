var path = require('path')
var orm = require('orm')
var mkdirp = require('mkdirp')

var MigrateTask = require('migrate-orm2')

var CONFIG_DIR = path.join(process.env.HOME, '.dropzone')

mkdirp.sync(CONFIG_DIR)

var DB_URL = 'sqlite://' + path.join(CONFIG_DIR, 'dropzone.db')

var storage = orm.connect(DB_URL)

storage.ready = function (next) {
  var task = new MigrateTask(storage.driver, {
    dir: 'migrations/storage'
  })
  task.up(function () {
    storage.sync(next)
  })
}

storage.define('CommKey', {
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

storage.define('Chat', {
  id: {
    type: 'serial',
    key: true
  },
  sessionTxId: {
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

module.exports = storage
