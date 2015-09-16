var network = require('./network')

var PREFIX = 'CNTRPRTY'

var P2PKH = 'OP_DUP OP_HASH160 %s OP_EQUALVERIFY OP_CHECKSIG'
var MULTISIG = '1 %s %s OP_CHECKMULTISIG'
var OPRETURN = 'OP_RETURN %s'

/* 33 is the size of a pubkey, there are two pubkeys in a multisig, 1 byte
   is lost for the data length byte, and two bytes are lost on each key for
   the data_to_pubkey inefficiency */
var BYTES_IN_MULTISIG = (33 * 2) - 1 - 2 - 2
var BYTES_IN_PUBKEYHASH = 20 - 1
var BYTES_IN_OPRETURN = 40

function TxEncoder (key, data, options) {
  this.key = key
  this.data = data

  options = options || {}
  this.network = options.network || network.main
}

TxEncoder.prototype.toOpMultisig = function () {
  return null
}

module.exports = {
  TxEncoder: TxEncoder
}
