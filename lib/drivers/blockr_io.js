var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')

var $ = bitcore.util.preconditions

var ConnectionRefusedError = webExplorer.ConnectionRefusedError
var UnsupportedFeatureError = webExplorer.UnsupportedFeatureError
var WebExplorer = webExplorer.WebExplorer

function BlockrIo (options, cb) {
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

  this._req(['/api/v1/tx/raw/', txid], function(err, data) {
    if (err) return next(err)

    var jsonData = JSON.parse(data)

    if (jsonData.status !== 'success') return cb(new MalformedResponseError())

    var attrs = this._hexToAttrs(jsonData.data.tx.hex)

    if (!attrs) return cb() // Not an err, just an unparseable record

    // Now we need the block height:
    this._req(['api/v1/block/info/', jsonData.data.tx.blockhash], function(err, data) {
      if (err) return next(err)

      var jsonData = JSON.parse(data)

      if (jsonData.status !== 'success') return cb(new MalformedResponseError())

      cb(null, extend({txid: txid, blockHeight: jsonData.data.nb}, attrs))
    })
  }.bind(this))
}

/* NOTE
 *  * that blockr.io only supports the last 200 transactions with this call
 *  * Not sure what to do about unconfirmed tx's yet (TODO)
 */ 
BlockrIo.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  this._req(['/api/v1/address/txs/', addr ,"?confirmations=0"], function(err, data) {
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

BlockrIo.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

module.exports = {
  BlockrIo: BlockrIo
}
