var crypto = require('crypto')
var util = require('util')

var bitcore = require('bitcore')

var Script = bitcore.Script
var Address = bitcore.Address

var DEFAULT_PREFIX = 'CNTRPRTY'
var OP_RETURN_PARTS = /^OP_RETURN ([a-f0-9]+)$/
var P2PKH_PARTS = /^OP_DUP OP_HASH160 ([a-f0-9]+) OP_EQUALVERIFY OP_CHECKSIG$/
var OP_MULTISIG_PARTS = /^OP_[12] ([a-f0-9 ]+) OP_([23]) OP_CHECKMULTISIG$/

util.inherits(TxDecoderError, Error)

function TxDecoderError (message) {
  this.name = this.constructor.name
  this.message = 'Transaction decoder error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function BadEncodingError () {
  TxDecoderError.call(this, 'bad encoding')
}

function TxDecoder (tx, options) {
  this.tx = tx

  options = options || {}

  this.prefix = options.prefix || DEFAULT_PREFIX
  this.decryptKey = options.decryptKey || tx.inputs[0].prevTxId

  this.parse(tx.outputs.map(function (output) {
    return output.script.toASM()
  }))
}

TxDecoder.prototype.isPrefixed = function (data, offset) {
  offset = offset || 1
  data = data.slice(offset, offset + this.prefix.length).toString('utf-8')
  return data === this.prefix
}

TxDecoder.prototype.decrypt = function (data) {
  var decipher = crypto.createDecipheriv('rc4', this.decryptKey, '')
  return Buffer.concat([decipher.update(data), decipher.final()])
}

TxDecoder.prototype.parse = function (outputs) {
  if (this.data) {
    return
  }

  var match
  var data
  var script

  match = outputs[0].match(P2PKH_PARTS)
  if (match) {
    data = new Buffer(match[1], 'hex')
    if (!this.isPrefixed(this.decrypt(data))) {
      script = Script.fromASM(outputs.shift())
      this.receiverAddr = Address.fromScript(script)
    }
  }

  match = outputs.slice(-1)[0].match(P2PKH_PARTS)
  if (match) {
    data = new Buffer(match[1], 'hex')
    if (!this.isPrefixed(this.decrypt(data))) {
      script = Script.fromASM(outputs.pop())
      this.senderAddr = Address.fromScript(script)
    }
  }

  var methodTest = {
    fromOpReturn: OP_RETURN_PARTS,
    fromOpCheckSig: P2PKH_PARTS,
    fromOpCheckMultisig: OP_MULTISIG_PARTS
  }

  this.data = Buffer.concat(outputs.map(function (output) {
    var test
    var match

    for (var method in methodTest) {
      test = methodTest[method]
      match = output.match(test)
      if (match) {
        break
      }
    }
    if (match) {
      return this[method].apply(this, match.slice(1))
    }
    return new Buffer()
  }.bind(this)))

  return this.data
}

TxDecoder.prototype.fromOpReturn = function (data) {
  if (!data) {
    throw new BadEncodingError()
  }

  data = this.decrypt(new Buffer(data, 'hex'))

  if (!this.prefixed(data, 0)) {
    throw new BadEncodingError()
  }

  return data.slice(this.prefix.length)
}

TxDecoder.prototype.fromOpCheckSig = function (hexPubKey) {
  var data = this.decrypt(new Buffer(hexPubKey, 'hex'))

  if (!this.isPrefixed(data)) {
    throw new BadEncodingError()
  }

  var length = data[0].length
  var start = 1 + this.prefix.length
  return data.slice(start, start + length + 1)
}

TxDecoder.prototype.fromOpCheckMultisig = function (hexPubKeys) {
  hexPubKeys = hexPubKeys.split(' ')

  var data = Buffer.concat(hexPubKeys.slice(0, -1).map(function (hexPubKey) {
    var data = new Buffer(hexPubKey, 'hex')
    return data.slice(1, data.length - 1)
  }))

  data = this.decrypt(data)

  if (!this.isPrefixed(data)) {
    throw new BadEncodingError()
  }

  return data.slice(1, 1 + data[0]).slice(this.prefix.length)
}

module.exports = {
  TxDecoder: TxDecoder,
  BadEncodingError: BadEncodingError
}
