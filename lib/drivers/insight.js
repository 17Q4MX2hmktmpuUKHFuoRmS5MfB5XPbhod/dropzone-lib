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

function Insight (options, cb) {
  this.__defineGetter__('baseUrl', function () { 
    // TODO: Handle a proto parameter to change the http/s
    return (this.isMutable) ? 'https://test-insight.bitpay.com/' 
      : 'https://insight.bitpay.com/'
  })

  var Super = this.constructor.super_
  Super.call(this, options, cb)
}

inherits(Insight, WebExplorer)
extend(Insight, WebExplorer)


Insight.prototype._txFromJson = function (json) {
  var bigHundredMil = new BigDecimal('100000000')

  return {hash: json.txid, version: json.version, 
    nLockTime: json.locktime,
    inputs: json.vin.map(function (vin) {
      return {prevTxId: vin.txid, outputIndex: vin.vout,
        sequenceNumber: vin.sequence, script: vin.scriptSig.hex}
    }),
    outputs: json.vout.map(function (vout){
      var satoshis = (new BigDecimal(vout.value))
        .multiply(bigHundredMil).intValueExact()

      return {satoshis: satoshis, script: vout.scriptPubKey.hex}
    })}
}

Insight.prototype._getBlockHeight = function (blockHash, cb) {
  this._req(['api/block/', blockHash], function(err, data) {
    if (err) return cb(err)
    cb(null, JSON.parse(data).height)
  })
}

Insight.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  this._req(['api/tx/', txid], function(err, data) {
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

Insight.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  // TODO: I think we need to support pages here
  this._req(['api/txs/?address=', addr], function(err, data) {
    if (err) return cb(err)
    this._filterTxs(JSON.parse(data).txs, null, options, cb)
  }.bind(this))
}

// TODO: Dry this out against the blockchain.info version.
Insight.prototype._filterTxs = function (txs, blockHeight, filter, cb) {
  var ret = []

  async.eachSeries(txs, function (jsonTx, next) { 
    var attrs = this._hexToAttrs(this._txFromJson(jsonTx))

    if (!attrs) return next()

    // This is a hacky acceleration hook itemtype scanning, but if we're looking
    // for created items, we only proceed if the recipient starts with 1DZ
    if ((filter.type == 'ITCRTE') && (!attrs.receiverAddr.match(/^1DZ/))) { 
      return next()
    }

    this._getBlockHeight(jsonTx.blockhash, function (err, blockHeight) {
      if (err) return cb(err)

      attrs.blockHeight = blockHeight

      if (!this._txSatisfiesOptions(attrs, filter)) return next()

      var msg = messages.fromTx(this, attrs)

      if (!msg) return next()

      msg.isValid(function (err, res) {
        if (err) return cb(err)
        if (res === null) ret.push(msg)
        next()
      })
    }.bind(this))
  }.bind(this), function (err) {
    if (err) return cb(err)
    // TODO: I think this block should get stuffed into web_explorer
    // This can only be determined after the transactions have been parsed:
    if ((ret.length > 0) && (filter.type)) {
      ret = ret.filter(
        function (msg) { return msg.messageType === filter.type })
    }

    cb(null, ret)
  })
}

Insight.prototype.messagesInBlock = function (height, options, cb) {
  /* NOTE: This should be supported, but it seems that there's a bug atm.
   *  Running this just causes a freeze:
   *  https://insight.bitpay.com/api/txs/?block=block-hash-here
   */
  cb(new UnsupportedFeatureError())
}

Insight.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

module.exports = {
  Insight: Insight
}
