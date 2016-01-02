var async = require('async')

var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')
var messages = require('../messages')

var $ = bitcore.util.preconditions

var ConnectionRefusedError = webExplorer.ConnectionRefusedError
var WebExplorer = webExplorer.WebExplorer

function BlockchainDotInfo (options, cb) {
  this.__defineGetter__('baseUrl', function () { 
    // TODO: Handle a tor parameter to change the url
    // TODO: Handle a secure parameter to change the http/s
    return 'https://blockchain.info/'
  })

  $.checkState((!options.isMutable), 
    'Blockchain.info only supports immutable blockchains')

  var Super = this.constructor.super_
  Super.call(this, options, cb)
}

inherits(BlockchainDotInfo, WebExplorer)
extend(BlockchainDotInfo, WebExplorer)


BlockchainDotInfo.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

BlockchainDotInfo.prototype._getRawTx = function (txid, cb) {
  this._req(['tx/', txid ,"?format=hex&cors=true"], function(err, data) {
    if (err) return cb(err)

    var attrs = this._hexToAttrs(data)

    cb(null, (attrs) ? extend({txid: txid}, this._hexToAttrs(data)) : null)
  }.bind(this))
}

// TODO : Dry this out against the insight version..
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

      var msg = messages.fromTx(this, tx)

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
        var jsonData = JSON.parse(data)
        next(null, (jsonData) ? 
          extend({blockHeight: jsonData.block_height}, attrs) : null)
      })
    }.bind(this)], cb)
}

/* NOTE:
 *  - This needs to return the messages in Descending order by block
 *   In the case that two transactions are in the same block, it goes by time
 * - This should return only 'valid' messages. Not all transactions
 */
BlockchainDotInfo.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  // TODO: Handle paging with offset?
  this._req(['rawaddr/', addr ,"?cors=true&limit=50"], function(err, data) {
    if (err) return cb(err)
    this._filterTxs(JSON.parse(data).txs, null, options, cb)
  }.bind(this))
}

BlockchainDotInfo.prototype.messagesInBlock = function (height, options, cb) {
  $.checkArgument(height, 'height is a required parameter')

  // TODO : document the options we accept in here...
  this._req(['block-height/',height,'?format=json&cors=true'], function(err, data) {
    if (err) return cb(err)
    blocks = JSON.parse(data).blocks

    // Don't waste time on any orphaned blocks returned
    var main
    for( var i=0; i<blocks.length; i++) {
      if (blocks[i].main_chain) {
        main = blocks[i]
        break
      }
    }

    if (!main) { return cb(null, null) }
 
    this._filterTxs(main.tx, height, options, cb)
  }.bind(this))
}

module.exports = {
  BlockchainDotInfo: BlockchainDotInfo
}
