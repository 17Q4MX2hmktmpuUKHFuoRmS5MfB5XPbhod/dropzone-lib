var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var webExplorer = require('./web_explorer')

var $ = bitcore.util.preconditions

var NoUtxosError = webExplorer.NoUtxosError
var RelayUnacceptedError = webExplorer.RelayUnacceptedError
var WebExplorer = webExplorer.WebExplorer

function Insight (options, cb) {
  if (!options) options = {}

  this.__defineGetter__('baseUrl', function () {
    // TODO: Handle a proto parameter to change the http/s
    // NOTE: The official insight.bitpay.com & test-insight.bitpay.com site
    // seems a bit unreliable for block transaction requests. bitlox.io
    // might be a better alternative at some point, but doesn't support https
    return (this.isMutable) ? 'http://test-insight.bitpay.com/api'
      : 'https://insight.bitpay.com/api'
  })

  var Super = this.constructor.super_
  Super.call(this, options, cb)
}

inherits(Insight, WebExplorer)
extend(Insight, WebExplorer)

function txFromJson (json) {
  return {hash: json.txid, version: json.version,
    nLockTime: json.locktime,
    inputs: json.vin.map(function (vin) {
      return {prevTxId: vin.txid, outputIndex: vin.vout,
        sequenceNumber: vin.sequence, script: vin.scriptSig.hex}
    }),
    outputs: json.vout.map(function (vout) {
      var satoshis = ((vout.valueSat !== null) &&
        (typeof vout.valueSat !== 'undefined')) ? vout.valueSat
        : webExplorer.bitcoinStrToSatoshis(vout.value)
      return {satoshis: satoshis, script: vout.scriptPubKey.hex}
    })}
}

function loadTx (txFromApi, filter, cb) {
  if (txFromApi.isCoinBase) return cb()

  var attrs = this._hexToAttrs(txFromJson(txFromApi))

  if (!attrs) return cb()

  // This is a hacky acceleration hook itemtype scanning, but if we're looking
  // for created items, we only proceed if the recipient starts with 1DZ
  if ((filter.type === 'ITCRTE') && (!attrs.receiverAddr.match(/^1DZ/))) {
    return cb()
  }

  cb(null, extend(attrs, {txid: txFromApi.txid}))
}

function getBlockHeight (blockHash, cb) {
  this._get(['/block/', blockHash], function (err, data) {
    if (err) return cb(err)
    cb(null, JSON.parse(data).height)
  })
}

function getBlockHash (blockHeight, cb) {
  this._get(['/block-index/', blockHeight], function (err, data) {
    if (err) return cb(err)
    cb(null, JSON.parse(data).blockHash)
  })
}

Insight.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  this._get(['/tx/', txid], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    var attrs = this._hexToAttrs(txFromJson(jsonData))

    if (!attrs) return cb() // Not an err, just an unparseable record

    // Now we need the block height:
    getBlockHeight.apply(this, [jsonData.blockhash, function (err, blockHeight) {
      if (err) return cb(err)
      cb(null, extend({txid: txid, blockHeight: blockHeight}, attrs))
    }])
  }.bind(this))
}

Insight.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  // TODO: I think we need to support pages here
  this._get(['/txs/?address=', addr], function (err, data) {
    if (err) return cb(err)
    this._filterTxs(JSON.parse(data).txs, function (txFromApi, filter, next) {
      loadTx.apply(this, [txFromApi, filter, function (err, tx) {
        if (err) return next(err)
        if (!tx) return next()
        getBlockHeight.apply(this, [txFromApi.blockhash,
          function (err, blockHeight) {
            if (err) return next(err)
            next(null, extend(tx, {blockHeight: blockHeight}))
          }])
      }.bind(this)])
    }.bind(this), options, cb)
  }.bind(this))
}

Insight.prototype.messagesInBlock = function (height, options, cb) {
  getBlockHash.apply(this, [height, function (err, blockHash) {
    if (err) return cb(err)
    this._get(['/txs/?block=', blockHash], function (err, data) {
      if (err) return cb(err)

      this._filterTxs(JSON.parse(data).txs, function (txFromApi, filter, next) {
        loadTx.apply(this, [txFromApi, filter, function (err, tx) {
          if (err) return next(err)
          next(null, (tx) ? extend(tx, {blockHeight: height}) : null)
        }])
      }.bind(this), options, cb)
    }.bind(this))
  }.bind(this)])
}

Insight.prototype.getUtxos = function (addr, cb) {
  this._get(['/addr/', addr, '/utxo'], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.length === 0) return cb(new NoUtxosError())

    cb(null, jsonData.map(function (utxo) {
      return { address: addr, txid: utxo.txid, outputIndex: utxo.vout,
        satoshis: webExplorer.bitcoinStrToSatoshis(String(utxo.amount)),
        scriptPubKey: utxo.scriptPubKey, confirmations: utxo.confirmations }
    }))
  })
}

Insight.prototype.relay = function (rawTx, cb) {
  this._post(['/tx/send'], {rawtx: rawTx}, function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (!jsonData.txid) return cb(new RelayUnacceptedError())

    cb()
  })
}

module.exports = {
  Insight: Insight
}
