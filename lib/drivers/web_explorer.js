var async = require('async')
var inherits = require('inherits')
var bitcore = require('bitcore-lib')
var request = require('superagent')
var retry = require('retry')

var txDecoder = require('../tx_decoder')
var messages = require('../messages')

var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var TxDecoder = txDecoder.TxDecoder

inherits(ConnectionError, Error)

function ConnectionError (message) {
  this.name = this.constructor.name
  this.message = 'Blockchain Driver Error: ' + message
  if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
}

function ConnectionRefusedError () {
  ConnectionError.call(this, 'error connecting via http')
}

function MalformedResponseError () {
  ConnectionError.call(this, 'unrecognized or malformed response from server')
}

function UnsupportedFeatureError () {
  ConnectionError.call(this, 'feature unsupported')
}

function NoUtxosError () {
  ConnectionError.call(this, 'No unspent tranasction outputs were available to spend')
}

function InsufficientBalanceError () {
  ConnectionError.call(this, 'Insufficient balance')
}

function WebExplorer (options, cb) {
  this.__defineGetter__('isMutable', function () {
    return (options.isMutable || false)
  })
  this.__defineGetter__('mutableNetwork', function () {
    return bitcore.Networks.testnet
  })
  this.__defineGetter__('immutableNetwork', function () {
    return bitcore.Networks.testnet
  })
  this.__defineGetter__('network', function () {
    return (this.isMutable) ? this.mutableNetwork : this.immutableNetwork
  })

  cb(null, this)
}

WebExplorer.prototype.privkeyToAddr = function (wif) {
  return PrivateKey.fromWIF(wif).toAddress(this.network).toString()
}

WebExplorer.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'),
    network || bitcore.Networks.mainnet).toString()
}

WebExplorer.prototype.hash160FromAddr = function (addr, network) {
  return (addr === 0) ? 0
    : Address.fromString(addr, network || bitcore.Networks.mainnet).hashBuffer
}

WebExplorer.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || bitcore.Networks.mainnet)
}

WebExplorer.prototype._hexToAttrs = function (hex) {
  try {
    var tx = new Transaction(hex)

    if (!tx) return null

    var record = new TxDecoder(tx, {prefix: 'DZ'})
    if (record.data.length === 0) return null

    return {data: record.data, receiverAddr: record.receiverAddr,
      senderAddr: record.senderAddr}
  } catch (e) {
    return null
  }
}

WebExplorer.prototype._txSatisfiesOptions = function (tx, options) {
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

  return where.every(function (f) { return f(tx) })
}

WebExplorer.prototype._filterTxs = function (txs, txLoader, filter, cb) {
  var msgs = []

  async.eachSeries(txs, function (tx, next) {
    txLoader(tx, filter, function (err, txAttrs) {
      if (err) return next(err)
      if (!txAttrs) return next()
      if (!this._txSatisfiesOptions(txAttrs, filter)) return next()

      var msg = messages.fromTx(this, txAttrs)

      if (!msg) return next()

      msg.isValid(function (err, res) {
        if (err) return next(err)
        if (res === null) msgs.push(msg)
        next()
      })
    }.bind(this))
  }.bind(this), function (err) {
    if (err) return cb(err)

    // Run the last filter on message types here, if applicable
    cb(null, ((msgs.length > 0) && (filter.type))
      ? msgs.filter(function (msg) { return msg.messageType === filter.type })
      : msgs)
  })
}

WebExplorer.prototype._req = function (parts, cb) {
  var url = [this.baseUrl].concat(parts).join('')

  var operation = retry.operation({retries: 8, factor: 3,
    minTimeout: 1 * 1000, maxTimeout: 60 * 1000, randomize: true})

  operation.attempt(function (currentAttempt) {
    request.get(url, function (err, res) {
      if (operation.retry(err)) return

      if (res.statusCode !== 200) {
        return operation.retry(new ConnectionRefusedError())
      }

      cb(err ? operation.mainError() : null, res.text)
    })
  })
}

module.exports = {
  WebExplorer: WebExplorer,
  ConnectionRefusedError: ConnectionRefusedError,
  UnsupportedFeatureError: UnsupportedFeatureError,
  MalformedResponseError: MalformedResponseError,
  NoUtxosError: NoUtxosError,
  InsufficientBalanceError: InsufficientBalanceError
}
