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

Toshi.prototype.sendValue = function (privateKeyWif, receiverAddr, amountInSatoshis, tip, cb) {
  // TODO: Asserts
  //
  var senderAddr = this.privkeyToAddr(privateKeyWif)

  this._req(['api/v0/addresses/', senderAddr, '/unspent_outputs'], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.length == 0) return cb(new NoUtxosError())

    var utxos = jsonData.map(function(utxo) {
      var script = Script.fromHex(utxo.script_hex).toString()
      return { "address": senderAddr, "txid": utxo.transaction_hash,
        "outputIndex": utxo.output_index, "satoshis": utxo.amount, 
        "script": script, "confirmations": utxo.confirmations }
    }).sort(function (a, b) { return a.satoshis - b.satoshis })

    var tx = new bitcore.Transaction()

//PrivateKey.fromWIF(privateKeyWif).publicKey
/*

    for (var i=0; i<transaction.inputs.length; i++) {
      console.log(transaction.inputs[i].getSignatures())
    }
// 
    transaction.sign(PrivateKey.fromWIF(privateKeyWif))

  // Ayn1k version: 
 */

    var allocated = 0
    var privKey = PrivateKey.fromWIF(privateKeyWif)
    var txos = []

    for (var i = 0, l = utxos.length; i < l; i++) {
      var utxo = utxos[i]
      allocated += utxo.satoshis
      txoScpt = Script(utxo.script)
      if (txoScpt.isMultisigOut()) {
        opCount = txoScpt.getSignatureOperationsCount()
        pubKeys = txoScpt.chunks.slice(1, 1 + opCount).map(function (pubKey) {
          return PublicKey.fromBuffer(pubKey.buf)
        })
        console.log(pubKeys)
        tx.addInput(new MultiSigInput({
          output: new Output({
            script: utxo.script,
            satoshis: utxo.satoshis
          }),
          prevTxId: utxo.txid,
          outputIndex: utxo.outputIndex,
          script: utxo.script,
          publicKeys: [privKey.publicKey],
          threshold: 1
        }))
      } else {
        tx.from({
          address: privKey.toAddress(this.network),
          txId: utxo.txid,
          outputIndex: utxo.outputIndex,
          satoshis: utxo.satoshis,
          script: utxo.script
        })
      }
      txos.push(utxo)
      if (allocated >= amountInSatoshis) break
    }

    if (allocated < amountInSatoshis) return cb(new InsufficientBalanceError())

    tx.to(receiverAddr, amountInSatoshis)
/*
    var txoScpts = new TxEncoder(tx.inputs[0].prevTxId, payload, {
      receiverAddr: this.receiverAddr,
      senderPubKey: pubKey,
      prefix: Message.prefix
    }).toOpMultisig()
    */

    var satoshis
// TODO: OUtputs
/*
    for (i = 0, l = txoScpts.length; i < l; i++) {
      txoScpt = Script.fromASM(txoScpts[i])
      satoshis = i === l - 1
        ? allocated - fee - (TXO_DUST * (l - 1))
        : TXO_DUST
      tx.addOutput(new Output({
        satoshis: satoshis,
        script: txoScpt
      }))
    }
*/

    tx.fee(tip)
    tx.sign(privKey)

    console.log("wha?")
    console.log(transaction.toString('hex'))

    cb(null, 'uhuhaoeu')
  })

}

Toshi.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

module.exports = {
  Toshi: Toshi
}
