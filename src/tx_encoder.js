var util = require('util')
var crypto = require('crypto')
var bitcore = require('bitcore')
var network = require('./network')

var PublicKey = bitcore.PublicKey

var DEFAULT_PREFIX = 'CNTRPRTY'
var OP_RETURN_SCPT = 'OP_RETURN %s'
var P2PKH_SCPT = 'OP_DUP OP_HASH160 %s OP_EQUALVERIFY OP_CHECKSIG'
var OP_MULTISIG_SCPT = 'OP_1 %s OP_%s OP_CHECKMULTISIG'
var BYTES_IN_MULTISIG = (33 * 2) - 1 - 2 - 2
var BYTES_IN_PUBKEYHASH = 20 - 1
var BYTES_IN_OPRETURN = 40

// ES6 Simplified polyfill
function fill (arr, val) {
  if (Array.prototype.fill) return arr.fill(val)
  for (var i = 0, l = arr.length; i < l; i++) {
    arr[i] = val
  }
  return arr
}

function TxEncoderError (message) {
  this.name = this.constructor.name
  this.message = 'Transaction encoder error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function BadEncodingError () {
  TxEncoderError.call(this, 'bad encoding')
}

function MissingSenderPubKeyError () {
  TxEncoderError.call(this, 'missing sender pubkey')
}

function MissingSenderAddrError () {
  TxEncoderError.call(this, 'bad sender address')
}

function DataTooLargeError () {
  TxEncoderError.call(this, 'data too large')
}

function InvalidPublicKeyError () {
  TxEncoderError.call(this, 'invalid public key')
}

function InvalidGenPublicKeyError () {
  TxEncoderError.call(this, 'invalid generated public key')
}

function TxEncoder (key, data, options) {
  this.key = key
  this.data = data

  options = options || {}

  this.network = options.network || network.main

  if (options.senderPubKey) {
    this.senderPubKey = options.senderPubKey
    this.senderAddr = this.senderPubKey.toAddress(this.network)
  } else if (options.senderAddr) {
    this.senderAddr = options.senderAddr
  } else {
    throw new MissingSenderAddrError()
  }

  if (options.receiverAddr) {
    this.receiverAddr = options.receiverAddr
  }

  this.prefix = options.prefix || DEFAULT_PREFIX
}

TxEncoder.prototype.toOpMultisig = function () {
  if (!this.senderPubKey) {
    throw new MissingSenderPubKeyError()
  }

  var len = BYTES_IN_MULTISIG - this.prefix.length

  return this.p2pkhWrap(this.eachChunk(this.data, len, function (chunk) {
    var nul = String.fromCharCode(0)
    var padding = new Buffer(fill(new Array(len - chunk.length), nul))
    var data = this.encrypt(Buffer.concat([
      new Buffer([chunk.length + this.prefix.length]),
      new Buffer(this.prefix),
      chunk,
      padding
    ]))
    var dataKeys = [[0, 31], [31, 62]].map(function (r) {
      return this.dataToPubKey(data.slice(r[0], r[1])).toString('hex')
    }.bind(this))
    var payload = dataKeys.concat(this.senderPubKey).join(' ')

    return util.format(OP_MULTISIG_SCPT, payload, 3)
  }.bind(this)))
}

TxEncoder.prototype.toPubKeyHash = function () {
  var len = BYTES_IN_PUBKEYHASH - this.prefix.length

  return this.p2pkhWrap(this.eachChunk(this.data, len, function (chunk) {
    var len = this.prefix.length + chunk.length
    var nul = String.fromCharCode(0)
    var padding = new Buffer(fill(new Array(BYTES_IN_PUBKEYHASH - len), nul))
    var data = this.encrypt(Buffer.concat([
      new Buffer([len]),
      new Buffer(this.prefix),
      chunk,
      padding
    ]))

    return util.format(P2PKH_SCPT, data.toString('hex'))
  }.bind(this)))
}

TxEncoder.prototype.toOpReturn = function () {
  if ((this.data.length + this.prefix.length) > BYTES_IN_OPRETURN) {
    throw new DataTooLargeError()
  }

  var data = this.encrypt(Buffer.concat([
    new Buffer(this.prefix),
    this.data
  ]))

  return this.p2pkhWrap(util.format(OP_RETURN_SCPT, data.toString('hex')))
}

TxEncoder.prototype.encrypt = function (data) {
  var cipher = crypto.createCipheriv('rc4', this.key, '')
  return Buffer.concat([cipher.update(data), cipher.final()])
}

TxEncoder.prototype.dataToPubKey = function (data) {
  if (data.length !== 31) {
    throw new InvalidPublicKeyError()
  }

  var hash = crypto.createHash('sha256').update(data).digest()
  var sign = (hash[0] & 1) + 2
  var origNonce = hash[1]
  var nonce = origNonce
  var pubKeyBytes

  do {
    nonce += 1
    if (nonce === origNonce) {
      continue
    }
    pubKeyBytes = Buffer.concat([new Buffer([sign]), data, new Buffer([nonce % 256])])
  } while (!PublicKey.isValid(pubKeyBytes))

  if (pubKeyBytes.length !== 33) {
    throw new InvalidGenPublicKeyError()
  }

  return new PublicKey(pubKeyBytes)
}

TxEncoder.prototype.p2pkhWrap = function (script) {
  var receiverScpt = null
  if (this.receiverAddr) {
    receiverScpt = util.format(P2PKH_SCPT, this.receiverAddr.toObject().hash)
  }

  var senderScpt = util.format(P2PKH_SCPT, this.senderAddr.toObject().hash)
  return [receiverScpt].concat(script).concat(senderScpt).filter(isNaN)
}

TxEncoder.prototype.eachChunk = function (data, len, fn) {
  var n = Math.ceil(this.data.length / len)

  return fill(new Array(n)).map(function (_, i) {
    var start = i * len
    return fn(data.slice(start, start + len))
  })
}

module.exports = {
  TxEncoder: TxEncoder,
  TxEncoderError: TxEncoderError,
  BadEncodingError: BadEncodingError,
  MissingSenderPubKeyError: MissingSenderPubKeyError,
  MissingSenderAddrError: MissingSenderAddrError,
  DataTooLargeError: DataTooLargeError,
  InvalidGenPublicKeyError: InvalidGenPublicKeyError
}
