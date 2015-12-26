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
    cb(null, null)
  }

  this.createTx = function (attrs, cb) {
    attrs.txid = String(transactions.push(extend({}, attrs)) - 1)

    cb(null, attrs)
  }

  this.getTx = function (id, cb) {
    cb(null, (transactions[id])
      ? extend({txid: String(id)}, transactions[id]) : null)
  }

  this.findTx = function (filter, cb) {
    var ret = []
    for (var i = (transactions.length - 1); i >= 0; i--) {
      if (filter(transactions[i])) {
        ret.push(extend({txid: String(i)}, transactions[i]))
      }
    }

    cb(null, ret)
  }

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
    where.push(function (tx) {
      return ((tx.senderAddr === options.forAddress) ||
        (tx.receiverAddr === options.forAddress))
    })
  }

  if ((options.blockHeight !== null) && (typeof options.blockHeight !== 'undefined')) {
    where.push(function (tx) {
      return (tx.blockHeight === parseInt(options.blockHeight, 10))
    })
  } else {
    if (options.startBlock) {
      where.push(function (tx) {
        return (tx.blockHeight >= parseInt(options.startBlock, 10))
      })
    }

    if (options.endBlock) {
      return where.push(function (tx) {
        (tx.blockHeight <= parseInt(options.endBlock, 10))
      })
    }
  }

  if (options.between) {
    var addr1 = options.between[0]
    var addr2 = options.between[1]

    where.push(function (tx) {
      return (((addr1 === tx.senderAddr) && (addr2 === tx.receiverAddr)) ||
        ((addr2 === tx.senderAddr) && (addr1 === tx.receiverAddr)))
    })
  }

  async.waterfall([
    function (next) {
      this.findTx(function (tx) {
        return where.every(function (f) { return f(tx) })
      }, next)
    }.bind(this),
    function (transactions, waterfallNext) {
      async.filter(transactions.map(function (tx) {
        return messages.fromTx(this, tx)
      }, this), function (msg, next) {
        if (!msg) return next(false)

        msg.isValid(function (err, res) {
          if (err) throw err
          next(!res)
        })
      }, function (messages) { waterfallNext(null, messages) })
    }.bind(this)],
    function (err, messages) {
      if (err) throw err

      // This can only be determined after the transactions have been parsed:
      if ((messages.length > 0) && (options.type)) {
        messages = messages.filter(
          function (msg) { return msg.messageType === options.type })
      }

      cb(null, messages)
    })
}

module.exports = {
  FakeBitcoinConnection: FakeChain
}
