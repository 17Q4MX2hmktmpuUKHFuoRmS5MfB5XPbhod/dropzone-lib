var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var bigdecimal = require('bigdecimal')

var BigDecimal = bigdecimal.BigDecimal
var webExplorer = require('./web_explorer')

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

function txFromJson (json) {
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

function loadTx(txFromApi, filter, cb) {
  var attrs = this._hexToAttrs(txFromJson(txFromApi))

  if (!attrs) return cb()

  // This is a hacky acceleration hook itemtype scanning, but if we're looking
  // for created items, we only proceed if the recipient starts with 1DZ
  if ((filter.type == 'ITCRTE') && (!attrs.receiverAddr.match(/^1DZ/))) { 
    return cb()
  }

  getBlockHeight.apply(this, [txFromApi.blockhash, function (err, blockHeight) {
    if (err) return cb(err)
    cb(null, extend(attrs, {blockHeight: blockHeight}))
  }])
}

function getBlockHeight (blockHash, cb) {
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

    var attrs = this._hexToAttrs(txFromJson(jsonData))

    if (!attrs) return cb() // Not an err, just an unparseable record

    // Now we need the block height:
    getBlockHeight.apply(this, [jsonData.blockhash, function (err, blockHeight) {
      if (err) return next(err)
      cb(null, extend({txid: txid, blockHeight: blockHeight}, attrs))
    }])
  }.bind(this))
}

Insight.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  // TODO: I think we need to support pages here
  this._req(['api/txs/?address=', addr], function(err, data) {
    if (err) return cb(err)
    this._filterTxs(JSON.parse(data).txs, loadTx.bind(this), options, cb)
  }.bind(this))
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
