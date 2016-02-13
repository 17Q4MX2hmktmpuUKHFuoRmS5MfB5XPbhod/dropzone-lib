var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')

var $ = bitcore.util.preconditions

var UnsupportedFeatureError = webExplorer.UnsupportedFeatureError
var WebExplorer = webExplorer.WebExplorer

function BlockchainDotInfo (options, cb) {
  if (!options) options = {}

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

function getRawTx (txid, cb) {
  this._get(['tx/', txid, '?format=hex&cors=true'], function (err, data) {
    if (err) return cb(err)

    var attrs = this._hexToAttrs(data)

    cb(null, (attrs) ? extend({txid: txid}, this._hexToAttrs(data)) : null)
  }.bind(this))
}

function loadTx (txFromApi, filter, cb) {
  // This is a hacky acceleration hook itemtype scanning, but if we're looking
  // for created items, we only proceed if the recipient starts with 1DZ
  if ((filter.type === 'ITCRTE') && ((!txFromApi.out) || (txFromApi.out.length === 0) ||
    (typeof txFromApi.out[0].addr !== 'string') ||
    (!txFromApi.out[0].addr.match(/^1DZ/)))) { return cb() }

  getRawTx.apply(this, [txFromApi.hash, function (err, tx) {
    if (err) return cb(err)
    if (!tx) return cb()

    tx.blockHeight = txFromApi.block_height

    cb(null, tx)
  }])
}

BlockchainDotInfo.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

BlockchainDotInfo.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  getRawTx.apply(this, [txid, function (err, attrs) {
    if (err) return cb(err)
    if (!attrs) return cb()

    // This is needed to retrieve Block Height
    this._get(['tx/', txid, '?format=json&cors=true'], function (err, data) {
      if (err) return cb(err)
      var jsonData = JSON.parse(data)
      cb(null, (jsonData)
        ? extend({blockHeight: jsonData.block_height}, attrs)
        : null)
    })
  }.bind(this)])
}

/* NOTE:
 *  - This needs to return the messages in Descending order by block
 *   In the case that two transactions are in the same block, it goes by time
 * - This should return only 'valid' messages. Not all transactions
 */
BlockchainDotInfo.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  if (typeof window !== 'undefined') return cb(new UnsupportedFeatureError())

  // TODO: Handle paging with offset?
  this._get(['rawaddr/', addr, '?cors=true&limit=50'], function (err, data) {
    if (err) return cb(err)
    this._filterTxs(JSON.parse(data).txs, loadTx.bind(this), options, cb)
  }.bind(this))
}

// TODO: If (window) raise unsupported
BlockchainDotInfo.prototype.messagesInBlock = function (height, options, cb) {
  $.checkArgument(height, 'height is a required parameter')

  if (typeof window !== 'undefined') return cb(new UnsupportedFeatureError())

  this._get(['block-height/', height, '?format=json&cors=true'], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    // Don't waste time on any orphaned blocks returned
    for (var i = 0; i < jsonData.blocks.length; i++) {
      if (jsonData.blocks[i].main_chain) break
    }

    if (!jsonData.blocks[i]) { return cb(null, null) }

    this._filterTxs(jsonData.blocks[i].tx,
      function (txFromApi, filter, next) {
        if (err) return next(err)
        loadTx.apply(this, [txFromApi, filter, function (err, tx) {
          if (err) return next(err)
          next(null, (tx) ? extend(tx, {blockHeight: height}) : null)
        }])
      }.bind(this), options, cb)
  }.bind(this))
}

module.exports = {
  BlockchainDotInfo: BlockchainDotInfo
}
