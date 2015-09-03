function TxDecode (tx, options) {
  this.tx = tx
  this.options = options || {}
}

TxDecode.DEFAULT_PREFIX = 'CNTRPRTY'
TxDecode.OP_RETURN_PARTS = /^OP_RETURN ([a-z0-9]+)$/
TxDecode.P2PKH_PARTS = /^OP_DUP OP_HASH160 ([a-z0-9]+) OP_EQUALVERIFY OP_CHECKSIG$/
TxDecode.OP_MULTISIG_PARTS = /^[12] ([a-z0-9 ]+) ([23]) OP_CHECKMULTISIG$/

