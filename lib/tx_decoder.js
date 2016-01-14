/**
 * @file Contains the transaction decoder logic, TxDecoder, and error classes.
 * @module tx_decoder
 */
var bitcore = require('bitcore-lib')
var arc4 = require('./arc4')
var DropzoneError = require('./dropzone_error')

var Networks = bitcore.Networks
var Script = bitcore.Script
var Address = bitcore.Address

var DEFAULT_PREFIX = 'CNTRPRTY'
var OP_RETURN_PARTS = /^OP_RETURN ([a-f0-9]+)$/
var P2PKH_PARTS = /^OP_DUP OP_HASH160 ([a-f0-9]+) OP_EQUALVERIFY OP_CHECKSIG$/
var OP_MULTISIG_PARTS = /^OP_[12] ([a-f0-9 ]+) OP_([23]) OP_CHECKMULTISIG$/

/**
 * This error is returned when the message was decoded, but contained an invalid
 * prefix.
 *
 * @class BadEncodingError
 */
function BadEncodingError () { DropzoneError.call(this, 'bad encoding') }

/**
 * The transaction could not be decoded.
 *
 * @class BadDecodingError
 */
function BadDecodingError () { DropzoneError.call(this, 'bad decoding') }

/**
 * A TxDecoder object parses a transaction, and unserializes the data that is
 * encoded on that transaction into it's primitive components. Principally,
 * this includes the sender, the receiver, and the binary data inside. This
 * component was ported from counterparty_ruby, and principally follows
 * the Counterparty message encoding format.
 *
 * @class TxDecoder
 * @param {Transaction} tx - bitcore transaction to decode
 * @param {Object} options
 * @param {String} options.prefix - The ASCII prefix of this encoding. Defaults
 *  to 'CNTRPRTY'
 * @param {Network} options.network - The bitcore network to use for decoding
 *  public sender/receiver addresses. Defaults to bitcore.Network.livenet
 */
function TxDecoder (tx, options) {
  options = options || {}

  /**
   * Returns the Transaction that was supplied in the constructor
   *
   * @name module:tx_decoder~TxDecoder#tx
   * @type Transaction
  */
  this.__defineGetter__('tx', function () { return tx })

  /**
   * Returns the expected encoding prefix of this decoding's data
   *
   * @name module:tx_decoder~TxDecoder#prefix
   * @type String
  */
  this.__defineGetter__('prefix', function () {
    return options.prefix || DEFAULT_PREFIX
  })

  /**
   * Returns the decrypton key used for obfuscation in this transaction
   *
   * @name module:tx_decoder~TxDecoder#decryptKey
   * @type String
  */
  this.__defineGetter__('decryptKey', function () {
    return options.decryptKey || tx.inputs[0].prevTxId
  })

  /**
   * Returns the Bitcoin network that was passed in the constructor (or livenet
   * if none was provided)
   *
   * @name module:tx_decoder~TxDecoder#network
   * @type Buffer
  */
  this.__defineGetter__('network', function () {
    return options.network || Networks.livenet
  })

  var parsedTx = this._parse(tx.outputs.map(function (output) {
    return output.script.toASM()
  }))

  /**
   * Returns the public key corresponding to the 'receiver' of this transaction
   *
   * @name module:tx_decoder~TxDecoder#receiverAddr
   * @type String
  */
  this.__defineGetter__('receiverAddr', function () { return parsedTx.receiverAddr })

  /**
   * Returns the public key corresponding to the 'sender' of this transaction
   *
   * @name module:tx_decoder~TxDecoder#senderAddr
   * @type String
  */
  this.__defineGetter__('senderAddr', function () { return parsedTx.senderAddr })

  /**
   * Returns the binary data that represents the content of this message
   *
   * @name module:tx_decoder~TxDecoder#data
   * @type Buffer
  */
  this.__defineGetter__('data', function () { return parsedTx.data })
}

TxDecoder.prototype._isPrefixed = function (data, offset) {
  if (typeof offset === 'undefined' || offset === null) {
    offset = 1
  }
  data = data.slice(offset, offset + this.prefix.length).toString('utf-8')
  return data === this.prefix
}

TxDecoder.prototype._decrypt = function (data) {
  return arc4(this.decryptKey).decode(data)
}

TxDecoder.prototype._parse = function (outputs) {
  if (this.data) return

  var ret = {}

  var match
  var data
  var script

  match = outputs[0].match(P2PKH_PARTS)
  if (match) {
    data = new Buffer(match[1], 'hex')
    if (!this._isPrefixed(this._decrypt(data))) {
      script = Script.fromASM(outputs.shift())
      ret.receiverAddr = Address.fromScript(script, this.network).toString()
    }
  }

  match = outputs.slice(-1)[0].match(P2PKH_PARTS)
  if (match) {
    data = new Buffer(match[1], 'hex')
    if (!this._isPrefixed(this._decrypt(data))) {
      script = Script.fromASM(outputs.pop())
      ret.senderAddr = Address.fromScript(script, this.network).toString()
    }
  }

  var methodTest = {
    _fromOpReturn: OP_RETURN_PARTS,
    _fromOpCheckSig: P2PKH_PARTS,
    _fromOpCheckMultisig: OP_MULTISIG_PARTS
  }

  ret.data = Buffer.concat(outputs.map(function (output) {
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
    return new Buffer(0)
  }.bind(this)))

  return ret
}

TxDecoder.prototype._fromOpReturn = function (data) {
  if (!data) {
    throw new BadDecodingError()
  }

  data = this._decrypt(new Buffer(data, 'hex'))

  if (!this._isPrefixed(data, 0)) {
    throw new BadDecodingError()
  }

  return data.slice(this.prefix.length)
}

TxDecoder.prototype._fromOpCheckSig = function (hexPubKey) {
  var data = this._decrypt(new Buffer(hexPubKey, 'hex'))

  if (!this._isPrefixed(data)) {
    throw new BadEncodingError()
  }

  var chunk_length = data[0]
  var start = 1 + this.prefix.length

  return data.slice(start, chunk_length + 1)
}

TxDecoder.prototype._fromOpCheckMultisig = function (hexPubKeys) {
  hexPubKeys = hexPubKeys.split(' ')

  var data = Buffer.concat(hexPubKeys.slice(0, -1).map(function (hexPubKey) {
    var data = new Buffer(hexPubKey, 'hex')
    return data.slice(1, data.length - 1)
  }))

  data = this._decrypt(data)

  if (!this._isPrefixed(data)) {
    throw new BadDecodingError()
  }

  return data.slice(1, 1 + data[0]).slice(this.prefix.length)
}

module.exports = {
  TxDecoder: TxDecoder,
  BadEncodingError: BadEncodingError,
  BadDecodingError: BadDecodingError
}
