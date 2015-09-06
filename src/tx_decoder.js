var crypto = require('crypto')
var util = require('util')

var bitcore = require('bitcore')

var Hash = bitcore.crypto.Hash
var Script = bitcore.Script
var Address = bitcore.Address

DEFAULT_PREFIX = 'CNTRPRTY'
OP_RETURN_PARTS = /^OP_RETURN ([a-f0-9]+)$/
P2PKH_PARTS = /^OP_DUP OP_HASH160 ([a-f0-9]+) OP_EQUALVERIFY OP_CHECKSIG$/
OP_MULTISIG_PARTS = /^OP_[12] ([a-f0-9 ]+) OP_([23]) OP_CHECKMULTISIG$/

util.inherits(TxDecoderError, Error)

function TxDecoderError (message) {
  this.name = this.constructor.name
  this.message = 'Transaction decoder error: ' + message
  Error.captureStackTrace(this, this.constructor);
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
  var data = data.slice(offset, offset + this.prefix.length).toString('utf-8')
  return data === this.prefix
}

TxDecoder.prototype.decrypt = function (chunk) {
  var decipher = crypto.createDecipheriv("rc4", this.decryptKey, '');   
  return Buffer.concat([decipher.update(chunk), decipher.final()])
}

TxDecoder.prototype.parse = function (outputs) {
  if (this.data) {
    return
  }

  var match 
  var chunk
  var script

  if (match = outputs[0].match(P2PKH_PARTS)) {
    chunk = new Buffer(match[1], 'hex')
    if (!this.isPrefixed(this.decrypt(chunk))) {
      script = Script.fromASM(outputs.shift())
      this.receiverAddr = Address.fromScript(script)
    }
  }

  if (match = outputs.slice(-1)[0].match(P2PKH_PARTS)) {
    chunk = new Buffer(match[1], 'hex')
    if (!this.isPrefixed(this.decrypt(chunk))) {
      script = Script.fromASM(outputs.pop())
      this.senderAddr = Address.fromScript(script)
    }
  }

  var methodTest = {
    fromOpReturn: OP_RETURN_PARTS, 
    fromOpCheckSig: P2PKH_PARTS,
    fromOpCheckMultisig: OP_MULTISIG_PARTS
  }
  
  return this.data = Buffer.concat(outputs.map(function (output) {
    var test
    var match

    for (var method in methodTest) {
      test = methodTest[method] 
      if (match = output.match(test)) {
        break
      }
    }
    if (match) {
      return this[method].apply(this, match.slice(1))
    }
    return new Buffer
  }.bind(this)))
}

TxDecoder.prototype.fromOpReturn = function (data) {
  if (!data) {
    throw new BadEncodingError
  }

  data = this.decrypt(new Buffer(data, 'hex'))

  if (!this.prefixed(data, 0)) {
    throw new BadEncodingError 
  }
  
  return data.slice(this.prefix.length)
}

TxDecoder.prototype.fromOpCheckSig = function (hexPubKey) {
  var chunk = this.decrypt(new Buffer(hexPubKey, 'hex'))

  if (!this.isPrefixed(chunk)) {
    throw new BadEncodingError
  }

  var length = chunk[0].length
  var start = 1 + this.prefix.length
  return chunk.slice(start, start + length + 1)
}

TxDecoder.prototype.fromOpCheckMultisig = function (hexPubKeys) {
  hexPubKeys = hexPubKeys.split(' ')

  var chunk = Buffer.concat(hexPubKeys.slice(0, -1).map(function (hexPubKey) {
    var chunk = new Buffer(hexPubKey, 'hex')
    return chunk.slice(1, chunk.length-1)
  }))

  var data = this.decrypt(chunk)

  if (!this.isPrefixed(data)) {
    throw new BadEncodingError
  }

  return data.slice(1, 1 + data[0]).slice(this.prefix.length)
}

module.exports = {
  TxDecoder: TxDecoder,
  BadEncodingError: BadEncodingError
}
