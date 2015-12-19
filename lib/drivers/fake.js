var orm = require('orm')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var async = require('async')
var merge = require('merge')

var messages = require('../messages')

var testnet = bitcore.Networks.testnet
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address

// TODO : Remove
// orm.settings.set("connection.debug", true);

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
  this.clearTransactions = function (cb) {
    height = 0
    this.Transaction.all().remove(cb)
  }

  this.incrementBlockHeight = function () {
    return ++height
  }

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
  })
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
  /*
   * We ignore the private key in this connection. We return the database id
   * in lieue of transaction id.
   */
  var blockchainState = {blockHeight: this.height(),
    senderAddr: this.privkeyToAddr(privateKey)}

  this.Transaction.create(merge(tx, blockchainState),
    function (err, record) { cb(err, (record) ? record.toMessageParams() : null) })
}

FakeChain.prototype.txById = function (id, cb) {
  this.Transaction.get(parseInt(id, 10), function (err, record) {
    if (err && err.literalCode !== 'NOT_FOUND') { throw err }

    cb(null, (record) ? record.toMessageParams() : null)
  })
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
  var query = this.Transaction.find({}, ['blockHeight', 'Z'], ['txid', 'Z'])

  var where = []
  if (options.forAddress) {
    // TODO: This is clearly a sql injection issue, but the library is acting
    // weird, and this sqllite/orm thing is schedule for deprecation anyways
    where.push(["(sender_addr = '" + options.forAddress + "'",
      "receiver_addr = '" + options.forAddress + "')"].join(' OR '))
  }

  if ((options.blockHeight !== null) && (typeof options.blockHeight !== 'undefined')) {
    where.push('blockHeight = ' + parseInt(options.blockHeight, 10))
  } else {
    if (options.startBlock) {
      where.push('blockHeight >= ' + parseInt(options.startBlock, 10))
    }

    if (options.endBlock) {
      where.push('blockHeight <= ' + parseInt(options.endBlock, 10))
    }
  }

  var connection = this

  async.waterfall([
    function (next) { query.where(where.join(' AND ')).all(next) },
    function (transactions, waterfallNext) {
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
