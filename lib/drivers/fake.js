var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var async = require('async')
var merge = require('merge')

var messages = require('../messages')

var testnet = bitcore.Networks.testnet
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address

var FakeChain = function (cb) {
  var height = 0

  this.__defineGetter__('isTesting', function () { return true })
  this.__defineGetter__('blockHeight', function () { return height })
  this.__defineGetter__('mutableNetwork', function () {
    return bitcore.Networks.testnet
  })
  this.__defineGetter__('immutableNetwork', function () {
    return bitcore.Networks.testnet
  })

  this.height = function () { return height }
  this.incrementBlockHeight = function () {
    return ++height
  }

  var transactions = []

  this.clearTransactions = function (cb) {
    height = 0
    transactions = [] 
    cb(null,null)
  }

  this.createTx = function (attrs, cb) {
    attrs.txid = String(transactions.push(attrs)-1)

    cb(null, attrs)
  }

  this.getTx = function (id, cb) {
    cb(null, extend({txid: String(id)}, transactions[id]))
  }

  this.findTx = function (filter, cb) {
    // TODO: We needto stringify the tx's maybe reintroduce the toMessageParams deal
    cb(null, transactions.filter(filter).sort(function(a,b) {
      if (a.blockHeight == b.blockHeight) return true
      // Sort by: ['blockHeight', 'Z'], ['txid', 'Z']
      return (a.blockHeight > b.blockHeight)
    }))
  }

  /*
  var that = this
  orm.connect('sqlite://', function (err, db) {
    if (err) return cb(err)

    that.Transaction = db.define('transactions', {
      txid: {type: 'serial', key: true},
      data: {type: 'binary'},
      receiverAddr: {type: 'text', mapsTo: 'receiver_addr'},
      senderAddr: {type: 'text', mapsTo: 'sender_addr'},
      tip: {type: 'integer'}, blockHeight: {type: 'integer'}
    }, {
      methods: { toMessageParams: function () {
        return { data: this.data, receiverAddr: this.receiverAddr,
          senderAddr: this.senderAddr, tip: this.tip,
          blockHeight: this.blockHeight,
          txid: (this.txid) ? String(this.txid) : null}
      }
    }})

    db.sync(cb)
  })*/
  cb(null)
}

FakeChain.prototype.privkeyToAddr = function (wif) {
  // TODO: We probably need to handle mainnet here too
  return PrivateKey.fromWIF(wif).toAddress(testnet).toString()
}

FakeChain.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'),
    network || testnet).toString()
}

FakeChain.prototype.hash160FromAddr = function (addr, network) {
  return (addr === 0) ? 0
    : Address.fromString(addr, network || testnet).hashBuffer
}

FakeChain.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || testnet)
}

FakeChain.prototype.save = function (tx, privateKey, cb) {
  // We ignore the private key in this connection.
  this.createTx(merge(tx, {blockHeight: this.height(),
    senderAddr: this.privkeyToAddr(privateKey)}), cb)
}

FakeChain.prototype.txById = function (id, cb) {
  this.getTx(parseInt(id, 10), cb)
}

/* NOTE:
 *  - This needs to return the messages in Descending order by block
 *   In the case that two transactions are in the same block, it goes by time
 * - This should return only 'valid' messages. Not all transactions
 */
FakeChain.prototype.messagesByAddr = function (addr, options, cb) {
  this._filterMessages(extend({}, options, {forAddress: addr}), cb)
}

FakeChain.prototype.messagesInBlock = function (height, options, cb) {
  this._filterMessages(extend({}, options, {blockHeight: height}), cb)
}

FakeChain.prototype._filterMessages = function (options, cb) {
  var where = []
  
  if (options.forAddress) {
    where.push(function(tx) { (tx.senderAddr === options.forAddress) ||
      (tx.receiverAddr == options.forAddress) })
  }

  if ((options.blockHeight !== null) && (typeof options.blockHeight !== 'undefined')) {
    where.push(function(tx) { 
      (tx.blockHeight === parseInt(options.blockHeight, 10)) 
    })
  } else {
    if (options.startBlock) {
      where.push(function(tx) { 
        (tx.blockHeight >= parseInt(options.startBlock, 10)) 
      })
    }

    if (options.endBlock) {
      where.push(function(tx) { 
        (tx.blockHeight <= parseInt(options.endBlock, 10)) 
      })
    }
  }

  var connection = this // TODO: Switch this to bind()

  async.waterfall([
    function (next) { 
      this.findTx(function(tx) {
        return where.every(function(f) { return f(tx) })
      }, next)
    }, function (transactions, waterfallNext) {
      async.filter(transactions.map(function (tx) {
        return messages.fromTx(connection, tx.toMessageParams())
      }), function (msg, next) {
        if (!msg) return next(false)

        msg.isValid(function (err, res) {
          if (err) throw err
          next(!res)
        })
      }, function (messages) { waterfallNext(null, messages) })
    }], function (err, messages) {
    if (err) throw err

    if (messages.length > 0) {
      if (options.type) {
        messages = messages.filter(
          function (msg) { return msg.messageType === options.type })
      }
    }

    // TODO : This should probably be moved into the where segment
    if (options.between) {
      var addr1 = options.between[0]
      var addr2 = options.between[1]
      messages = messages.filter(
        function (msg) {
          return (
            ((addr1 === msg.senderAddr) && (addr2 === msg.receiverAddr)) ||
            ((addr2 === msg.senderAddr) && (addr1 === msg.receiverAddr)))
        })
    }

    cb(null, messages)
  })
}

module.exports = {
  FakeBitcoinConnection: FakeChain
}
