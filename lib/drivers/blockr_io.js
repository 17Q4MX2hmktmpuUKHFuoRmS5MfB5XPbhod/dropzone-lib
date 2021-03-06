var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')

var $ = bitcore.util.preconditions

var UnsupportedFeatureError = webExplorer.UnsupportedFeatureError
var MalformedResponseError = webExplorer.MalformedResponseError
var RelayUnacceptedError = webExplorer.RelayUnacceptedError
var NoUtxosError = webExplorer.NoUtxosError
var WebExplorer = webExplorer.WebExplorer

function BlockrIo (options, cb) {
  if (!options) options = {}

  this.__defineGetter__('baseUrl', function () {
    // TODO: Handle a proto parameter to change the http/s
    return (this.isMutable) ? 'https://tbtc.blockr.io/' : 'https://btc.blockr.io/'
  })

  var Super = this.constructor.super_
  Super.call(this, options, cb)
}

inherits(BlockrIo, WebExplorer)
extend(BlockrIo, WebExplorer)

BlockrIo.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  this._get(['/api/v1/tx/raw/', txid], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.status !== 'success') return cb(new MalformedResponseError())

    var attrs = this._hexToAttrs(jsonData.data.tx.hex)

    if (!attrs) return cb() // Not an err, just an unparseable record

    // Now we need the block height. Note that this call doesn't include a few
    // of the parameters we need to construct a transaction (nLockTime, Version)
    // Which is dumb, because now we need two calls just to construct a tx:
    this._get(['/api/v1/tx/info/', txid], function (err, data) {
      if (err) return cb(err)

      var jsonData = JSON.parse(data)

      if (jsonData.status !== 'success') return cb(new MalformedResponseError())

      cb(null, extend({txid: txid, blockHeight: jsonData.data.block,
        tip: webExplorer.bitcoinStrToSatoshis(jsonData.data.fee)}, attrs))
    })
  }.bind(this))
}

/* NOTE
 *  * that blockr.io only supports the last 200 transactions with this call
 *  * Not sure what to do about unconfirmed tx's yet (TODO)
 */
BlockrIo.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  this._get(['/api/v1/address/txs/', addr, '?confirmations=0'], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.status !== 'success') return cb(new MalformedResponseError())

    this._filterTxs(jsonData.data.txs, function (txFromApi, filter, next) {
      this.txById(txFromApi.tx, next)
    }.bind(this), options, cb)
  }.bind(this))
}

/* NOTE
 *  * This function is unsupported, as the transactions in block call appears to
 *    only show the first 100 results in the block. Making this call useless.
 */
BlockrIo.prototype.messagesInBlock = function (height, options, cb) {
  cb(new UnsupportedFeatureError())
}

BlockrIo.prototype.getUtxos = function (addr, cb) {
  this._get(['/api/v1/address/unspent/', addr], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.status !== 'success') return cb(new MalformedResponseError())
    if (jsonData.data.unspent.length === 0) return cb(new NoUtxosError())

    cb(null, jsonData.data.unspent.map(function (utxo) {
      return { address: addr, txid: utxo.tx,
        outputIndex: utxo.n, script: utxo.script,
        satoshis: webExplorer.bitcoinStrToSatoshis(utxo.amount),
        confirmations: utxo.confirmations }
    }))
  })
}

BlockrIo.prototype.relay = function (rawTx, cb) {
  this._post(['/api/v1/tx/push'], {hex: rawTx}, function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (!jsonData.status !== 'success') return cb(new RelayUnacceptedError(jsonData.status))

    cb()
  })
}

module.exports = {
  BlockrIo: BlockrIo
}
