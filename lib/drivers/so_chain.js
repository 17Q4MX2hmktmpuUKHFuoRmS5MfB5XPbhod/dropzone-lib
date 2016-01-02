var async = require('async')

var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var bigdecimal = require('bigdecimal')

var BigDecimal = bigdecimal.BigDecimal
var webExplorer = require('./web_explorer')
var messages = require('../messages')

var $ = bitcore.util.preconditions
var Transaction = bitcore.Transaction

var ConnectionRefusedError = webExplorer.ConnectionRefusedError
var UnsupportedFeatureError = webExplorer.UnsupportedFeatureError
var WebExplorer = webExplorer.WebExplorer

function SoChain (options, cb) {
  this.__defineGetter__('baseUrl', function () { 
    // TODO: Handle a proto parameter to change the http/s
    return (this.isMutable) ? 'https://chain.so/'  // TODO: This is kind of weird, we need to handle a 'BTCTEST' network
      : 'https://chain.so/'
  })

  var Super = this.constructor.super_
  Super.call(this, options, cb)
}

inherits(SoChain, WebExplorer)
extend(SoChain, WebExplorer)

SoChain.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  // https://chain.so/api/v2/tx/BTC/3fa7a0d2d2913b15335827334e18c2980bfe86d5ef30302565569ef0b021e575
  this._req(['api/v2/tx/BTC/', txid], function(err, data) {
    if (err) return next(err)

    var jsonData = JSON.parse(data)

    var attrs = this._hexToAttrs(this._txFromJson(jsonData))

    if (!attrs) return cb() // Not an err, just an unparseable record

    // Now we need the block height:
    this._getBlockHeight(jsonData.blockhash, function (err, blockHeight) {
      if (err) return next(err)
      cb(null, extend({txid: txid, blockHeight: blockHeight}, attrs))
    })
  }.bind(this))
}

SoChain.prototype.messagesByAddr = function (addr, options, cb) {
  // https://chain.so/api/v2/address/BTC/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod
  cb(new UnsupportedFeatureError())
}

SoChain.prototype.messagesInBlock = function (height, options, cb) {
  // TODO: https://chain.so/api/v2/block/BTC/371812
  cb(new UnsupportedFeatureError())
}

SoChain.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

module.exports = {
  SoChain: SoChain
}
