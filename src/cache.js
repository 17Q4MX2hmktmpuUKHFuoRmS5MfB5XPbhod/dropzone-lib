var path = require('path')
var orm = require('orm')

var MigrateTask = require('migrate-orm2')

var CONFIG_DIR = path.join(process.env.HOME, '.dropzone')
var DB_URL = 'sqlite://' + path.join(CONFIG_DIR, 'cache.db')

var cache = orm.connect(DB_URL)

cache.ready = function (next) {
  var task = new MigrateTask(cache.driver, {
    dir: 'migrations/cache'
  })
  task.up(function () {
    cache.sync(next)
  })
}

var Tip = cache.define('Tip', {
  id: {
    type: 'serial',
    key: true
  },
  relevantAddr: {
    type: 'text',
    mapsTo: 'relevant_addr'
  },
  subject: String,
  blockId: {
    type: 'text',
    mapsTo: 'blockid'
  },
  blockHeight: {
    type: 'integer',
    mapsTo: 'block_height'
  }
}, {
  collection: 'tips'
})

Tip.setTip = function (subj, cur, up, next) {
  if (cur && cur.id) {
    for (var key in up) {
      if (key !== 'id' && key in cur) {
        cur[key] = up[key]
      }
    }
    cur.subject = subj
    return cur.save(next)
  }
  up.subject = subj
  this.create(up, next)
}

var Tx = cache.define('Tx', {
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

Tx.upsert = function (query, up, next) {
  Tx.one(query, function (err, tx) {
    if (err) return next(err)
    if (!tx) {
      return this.create(up, next)
    }
    next(null)
  }.bind(this))
}

cache.define('Utxo', {
  id: {
    type: 'serial',
    key: true
  },
  txId: {
    type: 'text',
    mapsTo: 'txid'
  },
  spenderAddr: {
    type: 'text',
    mapsTo: 'spender_addr'
  },
  index: Number,
  script: Buffer,
  satoshis: Number,
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
  collection: 'utxos'
})

module.exports = cache
