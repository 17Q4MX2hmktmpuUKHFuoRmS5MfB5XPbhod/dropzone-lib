var async = require('async')
var inherits = require('inherits')
var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

var webExplorer = require('./web_explorer')
var messages = require('../messages')

var $ = bitcore.util.preconditions

var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address

var ConnectionRefusedError = webExplorer.ConnectionRefusedError
var WebExplorer = webExplorer.WebExplorer

function BlockrIo (options, cb) {
  var Super = this.constructor.super_
  Super.call(this, options, cb)

  this.__defineGetter__('baseUrl', function () { 
    // TODO: Handle a proto parameter to change the http/s
    return (this.isMutable) ? 'https://tbtc.blockr.io/' : 'https://btc.blockr.io/'
  })
}

inherits(BlockrIo, WebExplorer)
extend(BlockrIo, WebExplorer)

BlockrIo.prototype.txById = function (txid, cb) {
  $.checkArgument(txid, 'Transaction id is a required parameter')

  this._req(['/api/v1/tx/raw/', txid], function(err, data) {
    if (err) return next(err)

    var jsonData = JSON.parse(data)

    // TODO: if(jsonData.status !== 'success') return next(err-her)

    var attrs = this._hexToAttrs(jsonData.data.tx.hex)

    if (!attrs) return cb() // Not an err, just an unparseable record

    // Now we need the block height:
    this._req(['api/v1/block/info/', jsonData.data.tx.blockhash], function(err, data) {
      if (err) return next(err)

      var jsonData = JSON.parse(data)
      // TODO: if(jsonData.status !== 'success') return next(err-her)

      cb(null, extend({txid: txid, blockHeight: jsonData.data.nb}, attrs))
    })
  }.bind(this))
}

BlockrIo.prototype.messagesByAddr = function (addr, options, cb) {
  cb() // TODO
}

BlockrIo.prototype.messagesInBlock = function (height, options, cb) {
  cb() // TODO
}

module.exports = {
  BlockrIo: BlockrIo
}
