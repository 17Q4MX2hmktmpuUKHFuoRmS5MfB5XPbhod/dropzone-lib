var path = require('path')
var orm = require('orm')

var CONFIG_DIR = path.join(process.env.HOME, '.dropzone')

var cache = orm.connect('sqlite://' + path.join(CONFIG_DIR, 'cache.db'))

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
  blockHeight: {
    type: 'integer',
    mapsTo: 'block_height'
  }
}, {
  collection: 'transactions'
})

module.exports = cache
