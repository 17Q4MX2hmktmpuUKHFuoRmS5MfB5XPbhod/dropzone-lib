var inherits = require('inherits')
var async = require('async')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')
var MalformedResponseError = webExplorer.MalformedResponseError
var NoUtxosError = webExplorer.NoUtxosError

var $ = bitcore.util.preconditions
var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var PublicKey = bitcore.PublicKey
var Script = bitcore.Script
var MultiSigInput = bitcore.Transaction.Input.MultiSig
var Output = bitcore.Transaction.Output

var WebExplorer = webExplorer.WebExplorer

function Toshi (options, cb) {
  this.__defineGetter__('baseUrl', function () {
    return (this.isMutable) ? 'https://testnet3.toshi.io/' : 'https://bitcoin.toshi.io/'
  })

  var Super = this.constructor.super_
  Super.call(this, options, cb)
}

inherits(Toshi, WebExplorer)
extend(Toshi, WebExplorer)

function txFromJson (json) {
  return {hash: json.hash, version: json.version,
    nLockTime: json.lock_time,
    inputs: json.inputs.map(function (vin) {
      // The inputs are returned in hex format, which is a little weird
      // so we assemble it into an asm format which isnt too hard:
      // http://bitcoin.stackexchange.com/questions/24651/whats-asm-in-transaction-inputs-scriptsig
      var scriptHex = vin.script.split(' ').map(function (p) {
        return Math.round((p.length / 2)).toString(16) + p
      }).join('')
 
      return {prevTxId: vin.previous_transaction_hash, script: scriptHex,
        outputIndex: vin.output_index}
    }),
    outputs: json.outputs.map(function (vout) {
      return {satoshis: vout.amount, script: vout.script_hex}
    })}
}

function loadTx (txFromApi, filter, cb) {
  if (txFromApi.inputs[0].coinbase) return cb()

  var attrs = this._hexToAttrs(txFromJson(txFromApi))

  if (!attrs) return cb()

  // This is a hacky acceleration hook itemtype scanning, but if we're looking
  // for created items, we only proceed if the recipient starts with 1DZ
  if ((filter.type === 'ITCRTE') && (!attrs.receiverAddr.match(/^1DZ/))) {
    return cb()
  }

  cb(null, extend(attrs, {txid: txFromApi.hash, 
    blockHeight:txFromApi.block_height}))
}

Toshi.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  // https://github.com/coinbase/toshi/blob/master/lib/toshi/web/api.rb#L134
  this._req(['api/v0/transactions/', txid], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    var attrs = this._hexToAttrs(txFromJson(jsonData))

    if (!attrs) return cb() // Not an err, just an unparseable record

    cb(null, extend({txid: txid, blockHeight: jsonData.block_height, 
      tip: jsonData.fees}, attrs))
  }.bind(this))
}

Toshi.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  var txsPerPage = 100
  var transactions = []

  var i = 0
  var isFinished = false
  async.whilst(
    function () { return !isFinished },
    function (next) {
      var url = ['api/v0/addresses/', addr, '/transactions?limit=', 
        String(txsPerPage), '&offset=', String(i*txsPerPage)]

      this._req(url, function (err, data) {
        if (err) return next(err)

        var jsonData = JSON.parse(data)
        var pageTransactions = jsonData.transactions

        if (i==0 && jsonData.unconfirmed_transactions.length > 0)
          Array.prototype.push.apply(transactions, jsonData.unconfirmed_transactions)

        // Push these transactions onto the set:
        Array.prototype.push.apply(transactions, pageTransactions)

        if (pageTransactions.length < txsPerPage)
          isFinished = true
        else
          i+=1

        next()
      }.bind(this))
    }.bind(this),
    function (err) {
      if (err) return cb(err)
      this._filterTxs(transactions, loadTx.bind(this), options, cb)
    }.bind(this)
  )
}

Toshi.prototype.messagesInBlock = function (height, options, cb) {
  $.checkArgument(height, 'height is a required parameter')

  var baseUrl = ['api/v0/blocks/', height,'/transactions?limit=1000'].join('')

  // First page is a special case:
  this._req([baseUrl, '&offset=0'], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    var transactions = jsonData.transactions
    var totalTransactions = jsonData.transactions_count

    var i = 1
    async.whilst(
      function () { return i < Math.ceil(totalTransactions / 1000) },
      function (next) {
        // DO something
        this._req([baseUrl, '&offset='+String(1000*i)], function (err, data) {
          if (err) return next(err)

          // Push these transactions onto the set:
          Array.prototype.push.apply(transactions, JSON.parse(data).transactions)

          i+=1
          next()
        })
      }.bind(this),
      function (err) {
        if (err) return cb(err)
        this._filterTxs(transactions, loadTx.bind(this), options, cb)
      }.bind(this))
  }.bind(this))
}

Toshi.prototype.getUtxos = function (addr, cb) {
  this._req(['api/v0/addresses/', addr, '/unspent_outputs'], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.length == 0) return cb(new NoUtxosError())

    // Query for the available utxo's
    var utxos = jsonData.map(function(utxo) {
      var script = Script.fromHex(utxo.script_hex).toString()
      return { address: addr, txid: utxo.transaction_hash,
        outputIndex: utxo.output_index, satoshis: utxo.amount, 
        script: script, confirmations: utxo.confirmations }
    }).sort(function (a, b) { return a.satoshis - b.satoshis })

    cb(null, utxos)
  })
}

// TODO: A push() is still needed

module.exports = {
  Toshi: Toshi
}
