var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')
var MalformedResponseError = webExplorer.MalformedResponseError

var $ = bitcore.util.preconditions
var Transaction = bitcore.Transaction

var WebExplorer = webExplorer.WebExplorer

function Toshi (options, cb) {
  this.__defineGetter__('baseUrl', function () {
    // TODO: Handle a proto parameter to change the http/s
    return 'https://bitcoin.toshi.io/'
  })

  $.checkState((!options.isMutable), 'Toshi only supports immutable blockchains')

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
      // so we assemble it into an asm format by assuming they're in 
      // OP_CHECKSIG format. NOTE: I'm not sure this is a safe assumption...
      var scriptAsm = '48'+vin.script.split(' ').join('41')
        console.log(scriptAsm)
      
      return {prevTxId: vin.previous_transaction_hash, 
        outputIndex: vin.output_index, scriptString: scriptAsm}
    }),
    outputs: json.outputs.map(function (vout) {
      return {satoshis: vout.amount, script: vout.script}
    })}
}

Toshi.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  this._req(['api/v0/transactions/', txid], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    var attrs = this._hexToAttrs(txFromJson(jsonData))
    // We need a 48 at the start, and a 41 instead of the space
    // http://bitcoin.stackexchange.com/questions/24651/whats-asm-in-transaction-inputs-scriptsig
    // I think it's just the length
console.log(new Transaction(txFromJson(jsonData)))
    if (!attrs) return cb() // Not an err, just an unparseable record

    cb(null, extend({txid: txid, blockHeight: jsonData.block_height, 
      tip: jsonData.fees}, attrs))
  }.bind(this))
}
/*
Toshi.prototype.messagesByAddr = function (addr, options, cb) {
  $.checkArgument(addr, 'addr is a required parameter')

  this._req(['api/v2/address/', this._chainNet, '/', addr], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.status !== 'success') return cb(new MalformedResponseError())

    this._filterTxs(jsonData.data.txs, loadTx.bind(this), options, cb)
  }.bind(this))
}

Toshi.prototype.messagesInBlock = function (height, options, cb) {
  $.checkArgument(height, 'height is a required parameter')

  this._req(['api/v2/block/', this._chainNet, '/', height], function (err, data) {
    if (err) return cb(err)

    var jsonData = JSON.parse(data)

    if (jsonData.status !== 'success') return cb(new MalformedResponseError())

    this._filterTxs(jsonData.data.txs,
      function (txFromApi, filter, next) {
        loadTx.apply(this, [txFromApi, filter, function (err, tx) {
          if (err) return next(err)
          next(null, (tx) ? extend(tx, {blockHeight: height}) : null)
        }])
      }.bind(this), options, cb)
  }.bind(this))
}
*/

Toshi.prototype.save = function (tx, privateKey, cb) {
  // TODO
}

module.exports = {
  Toshi: Toshi
}
