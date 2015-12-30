var async = require('async')

var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var https = require('https')

var messages = require('../messages')
var txDecoder = require('../tx_decoder')

var $ = bitcore.util.preconditions
var testnet = bitcore.Networks.testnet
var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var TxDecoder = txDecoder.TxDecoder

// TODO : We should probably standardize these driver errors somewhere
inherits(ConnectionError, Error)

function ConnectionError (message) {
  this.name = this.constructor.name
  this.message = 'Blockchain Driver Error: ' + message
  if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
}

function ConnectionRefusedError () {
  ConnectionError.call(this, 'error connecting via http')
}

var BlockchainDotInfo = function (options, cb) {
  // TODO: Raise error if testnet option is passed
  // TODO: Handle a tor parameter to change the url
  this.__defineGetter__('isTesting', function () { return false })
  this.__defineGetter__('mutableNetwork', function () {
    return bitcore.Networks.testnet
  })
  this.__defineGetter__('immutableNetwork', function () {
    return bitcore.Networks.testnet
  })

  cb(null)
}

BlockchainDotInfo.prototype.privkeyToAddr = function (wif) {
  // TODO : do we need to handle testnet?
  return PrivateKey.fromWIF(wif).toAddress(mainnet).toString()
}

BlockchainDotInfo.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'),
    network || mainnet).toString()
}

BlockchainDotInfo.prototype.hash160FromAddr = function (addr, network) {
  return (addr === 0) ? 0
    : Address.fromString(addr, network || mainnet).hashBuffer
}

BlockchainDotInfo.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || mainnet)
}

BlockchainDotInfo.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

BlockchainDotInfo.prototype._req = function (parts, cb) {
  var url = ['https://blockchain.info/'].concat(parts).join('')
// TODO: Support debug
  https.get(url, function(res){
    var data = ''

    if (res.statusCode !== 200) return cb(new ConnectionRefusedError(), null)

    res.on('data', function (chunk){ data += chunk })
    res.on('end', function() { cb(null, data) })
  }).on('error', function(e) { return cb(new ConnectionRefusedError(), null) })
}

BlockchainDotInfo.prototype._txSatisfiesOptions = function (tx, options) {
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

BlockchainDotInfo.prototype._getRawTx = function (txid, cb) {
  this._req(['tx/', txid ,"?format=hex&cors=true"], function(err, data) {
    if (err) return cb(err)

    try {
      var record = new TxDecoder(new Transaction(data), {prefix: 'DZ'})
    } catch (e) {
      return cb(null, null)
    }

    cb(null, {data: record.data, txid: txid,
      receiverAddr: record.receiverAddr, senderAddr: record.senderAddr})
  })
}

BlockchainDotInfo.prototype._filterTxs = function (txs, blockHeight, filter, cb) {
  var ret = []

  // TODO: Are we returning the newest first? (Is that right?)
  async.eachSeries(txs, function (txinfo, next) { 
    // This is a hacky acceleration hook itemtype scanning, but if we're looking
    // for created items, we only proceed if the recipient starts with 1DZ
    if ((filter.type == 'ITCRTE') && ((!txinfo.out) || (txinfo.out.length == 0) || 
      (typeof txinfo.out[0].addr !== 'string') || 
      (!txinfo.out[0].addr.match(/^1DZ/)))) { return next() }

    this._getRawTx(txinfo.hash, function (err, tx) { 
      if (err) return cb(err)
      if (!tx || (tx.data.length == 0)) return next()

      // Fortunately The height is present in the addr query
      tx.blockHeight = ((blockHeight !== null) && (typeof blockHeight !== 'undefined'))
          ? blockHeight : txinfo.block_height

      if (!this._txSatisfiesOptions(tx, filter)) return next()

      msg = messages.fromTx(this, tx)

      if (!msg) return next()

      msg.isValid(function (err, res) {
        if (err) return cb(err)
        if (res === null) ret.push(msg)
        next()
      })
    }.bind(this))
  }.bind(this), function (err) {
    if (err) return cb(err)

    // This can only be determined after the transactions have been parsed:
    if ((ret.length > 0) && (filter.type)) {
      ret = ret.filter(
        function (msg) { return msg.messageType === filter.type })
    }

    cb(null, ret)
  })
}

BlockchainDotInfo.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  async.waterfall([
    function(next) { this._getRawTx(txid, next) }.bind(this),
    function(attrs, next) {
      if (!attrs) return next()

      // This is needed to retrieve Block Height
      this._req(['tx/', txid ,"?format=json&cors=true"], function(err, data) {
        next(null, extend({blockHeight: JSON.parse(data).block_height}, attrs))
      })
    }.bind(this)], cb)
}

/* NOTE:
 *  - This needs to return the messages in Descending order by block
 *   In the case that two transactions are in the same block, it goes by time
 * - This should return only 'valid' messages. Not all transactions
 */
BlockchainDotInfo.prototype.messagesByAddr = function (addr, options, cb) {
  // TODO: Handle paging with offset?
  this._req(['rawaddr/', addr ,"?cors=true&limit=50"], function(err, data) {
    if (err) return cb(err)
    this._filterTxs(JSON.parse(data).txs, null, options, cb)
  }.bind(this))
}

BlockchainDotInfo.prototype.messagesInBlock = function (height, options, cb) {
  // TODO : document the options we accept in here...
  this._req(['block-height/',height,'?format=json&cors=true'], function(err, data) {
    if (err) return cb(err)
    blocks = JSON.parse(data).blocks

    // Don't waste time on any orphaned blocks returned
    main = blocks.find(function(b) { return b.main_chain })

    if (!main) { return cb(null, null) }
 
    this._filterTxs(main.tx, height, options, cb)
  }.bind(this))
}

BlockchainDotInfo.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

module.exports = {
  BlockchainDotInfo: BlockchainDotInfo
}
