/**
 * @file Contains the transaction encoder logic, TxEncoder, and error classes.
 * @module tx_encoder
 */
var util = require('util')
var bitcore = require('bitcore-lib')
var arc4 = require('./arc4')

var DropzoneError = require('./dropzone_error')

var Networks = bitcore.Networks
var PublicKey = bitcore.PublicKey
var Hash = bitcore.crypto.Hash

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

/**
 * This error is returned when the options.pubkey parameter required to create
 * multisig encodings was not passed in the constructor. (And a multisig
 * encoding was attempted)
 *
 * @class MissingSenderPubKeyError
 */
function MissingSenderPubKeyError () {
  DropzoneError.call(this, 'missing sender pubkey')
}

/**
 * This error is raised when a senderAddr wasn't passed in the options.senderAddr
 * parameter, and/or when the senderAddr could not be computed from the
 * senderPubkey parameter.
 *
 * @class MissingSenderAddrError
 */
function MissingSenderAddrError () {
  DropzoneError.call(this, 'bad sender address')
}

/**
 * This error occurs if an error occurs when constructing an op_multisig and the
 * data aligned sanity checks fail. (Report to authors if this ever happens)
 *
 * @class MissingSenderAddrError
 */
function DataTooLargeError () { DropzoneError.call(this, 'data too large') }

/**
 * The provided senderPubkey was invalid and could not be used.
 *
 * @class InvalidPublicKeyError
 */
function InvalidPublicKeyError () {
  DropzoneError.call(this, 'invalid public key')
}

/**
 * This error occurs if an error occurs when constructing an op_multisig and the
 * data aligned sanity checks fail. (Report to authors if this ever happens)
 *
 * @class InvalidGenPublicKeyError
 */
function InvalidGenPublicKeyError () {
  DropzoneError.call(this, 'invalid generated public key')
}

/**
 * A Transaction encoder object takes an arc obfuscation key and data, and
 * can be used to construct an array of bitcoin output scripts which will store
 * the provided data.
 *
 * @class TxEncoder
 * @param {String} encryptKey - arc4 obfuscation key. Should be obtained from the output
 *  transactions  first input's prevTxid
 * @param {Buffer} data
 * @param {Object} options
 * @param {String} options.prefix - The ASCII prefix of this encoding. Defaults
 *  to 'CNTRPRTY'
 * @param {String} options.senderPubkey - The full public key of the sender.
 *  Only needed for toOpMultisig encoding.
 * @param {String} options.senderAddr - The address of the sender. This can be
 *  automatically calculated from the senderPubkey, and is not strictly necessary
 *  unless you'll be encoding to a non OpMulisig form.
 * @param {String} options.receiverAddr - The address of the receiver. This
 *  is not always necessary for some transactions (such as broadcasts)
 * @param {Network} options.network - The bitcore network to use for encoding
 *  senderPubkey. Defaults to bitcore.Network.livenet
 * @param {Network} options.disableChangeOutput - Whether to include the change
 *  return P2PKH_SCPT. Defaults to false. 
 */
function TxEncoder (encryptKey, data, options) {
  options = options || {}

  /**
   * Returns the arc4 obfuscation key that was passed in the constructor
   *
   * @name module:tx_encoder~TxEncoder#encryptKey
   * @type String
  */
  this.__defineGetter__('encryptKey', function () { return encryptKey })

  /**
   * Returns the data being encoded, as was passed in the constructor
   *
   * @name module:tx_encoder~TxEncoder#data
   * @type Buffer
  */
  this.__defineGetter__('data', function () { return data })

  /**
   * Returns the Bitcoin network that is being used for senderAddr processing
   *
   * @name module:tx_encoder~TxEncoder#network
   * @type Buffer
   * @default Bitcore.Networks.livenet
  */
  this.__defineGetter__('network', function () {
    return options.network || Networks.livenet
  })

  /**
   * Returns the senderPubkey that was passed in the constructor (if one was
   * provided)
   *
   * @name module:tx_encoder~TxEncoder#senderPubkey
   * @type String
  */
  this.__defineGetter__('senderPubKey', function () {
    return options.senderPubKey
  })

  /**
   * Returns the senderAddr of this encoding.
   *
   * @name module:tx_encoder~TxEncoder#senderAddr
   * @type String
  */
  this.__defineGetter__('senderAddr', function () {
    return (options.senderPubKey) ? this.senderPubKey.toAddress(this.network)
      : options.senderAddr
  })

  /**
   * Returns the receiverAddr of this encoding.
   *
   * @name module:tx_encoder~TxEncoder#receiverAddr
   * @type String
   * @default undefined
  */
  this.__defineGetter__('receiverAddr', function () {
    return options.receiverAddr
  })

  /**
   * Returns the data prefix of this encoding
   *
   * @name module:tx_encoder~TxEncoder#prefix
   * @type String
   * @default CNTRPRTY
  */
  this.__defineGetter__('prefix', function () {
    return options.prefix || DEFAULT_PREFIX
  })

  /**
   * Returns whether this encoding will include an output to return the leftover
   * allocation.
   *
   * @name module:tx_encoder~TxEncoder#disableChangeOutput
   * @type Boolean
   * @default true
  */
  this.__defineGetter__('disableChangeOutput', function () {
    return (options.disableChangeOutput) ? true : false
  })
  

  if (!this.senderAddr) throw new MissingSenderAddrError()
}

TxEncoder.prototype._encrypt = function (data) {
  return arc4(this.encryptKey).encode(data)
}

TxEncoder.prototype._dataToPubKey = function (data) {
  if (data.length !== 31) throw new InvalidPublicKeyError()

  var hash = Hash.sha256(data)
  var sign = (hash[0] & 1) + 2
  var origNonce = hash[1]
  var nonce = origNonce
  var pubKeyBytes

  do {
    nonce += 1
    if (nonce === origNonce) {
      continue
    }
    pubKeyBytes = Buffer.concat([new Buffer([sign]), data,
      new Buffer([nonce % 256])])
  } while (!this._publicKeyIsValid(pubKeyBytes))

  if (pubKeyBytes.length !== 33) throw new InvalidGenPublicKeyError()

  return new PublicKey(pubKeyBytes)
}

TxEncoder.prototype._p2pkhWrap = function (script) {
  var ret = []
  if (this.receiverAddr) {
    ret.push(util.format(P2PKH_SCPT, this.receiverAddr.toObject().hash))
  }

  Array.prototype.push.apply(ret, (typeof script == 'string') ? [script] : script)

  if (!this.disableChangeOutput) {
    ret.push(util.format(P2PKH_SCPT, this.senderAddr.toObject().hash))
  }

  return ret
}

TxEncoder.prototype._eachChunk = function (data, len, fn) {
  var n = Math.ceil(this.data.length / len)

  return fill(new Array(n)).map(function (_, i) {
    var start = i * len
    return fn(data.slice(start, start + len))
  })
}

TxEncoder.prototype._publicKeyIsValid = function (bytes) {
  // Since bitcore doesn't perform proper validation of whether the key's points
  // lie on the actual EC2 curve, we do it ourselves:
  var info = PublicKey._transformDER(bytes)

  return (PublicKey.isValid(bytes) && info.point.curve.validate(info.point))
}

/**
 * Return an array of strings representing this data's encoding in the OpMultisig
 * bitcoin output format
 *
 * @function
 * @return {Array}
 */
TxEncoder.prototype.toOpMultisig = function () {
  if (!this.senderPubKey) throw new MissingSenderPubKeyError()

  var len = BYTES_IN_MULTISIG - this.prefix.length

  return this._p2pkhWrap(this._eachChunk(this.data, len, function (chunk) {
    var nul = String.fromCharCode(0)
    var padding = new Buffer(fill(new Array(len - chunk.length), nul))
    var data = this._encrypt(Buffer.concat([
      new Buffer([chunk.length + this.prefix.length]),
      new Buffer(this.prefix),
      chunk,
      padding
    ]))
    var dataKeys = [[0, 31], [31, 62]].map(function (r) {
      return this._dataToPubKey(data.slice(r[0], r[1])).toString('hex')
    }.bind(this))
    var payload = dataKeys.concat(this.senderPubKey).join(' ')

    return util.format(OP_MULTISIG_SCPT, payload, 3)
  }.bind(this)))
}

/**
 * Return an array of strings representing this data's encoding in the PublicKeyHash
 * bitcoin output format
 *
 * @function
 * @return {Array}
 */
TxEncoder.prototype.toPubKeyHash = function () {
  var len = BYTES_IN_PUBKEYHASH - this.prefix.length

  return this._p2pkhWrap(this._eachChunk(this.data, len, function (chunk) {
    var len = this.prefix.length + chunk.length
    var nul = String.fromCharCode(0)
    var padding = new Buffer(fill(new Array(BYTES_IN_PUBKEYHASH - len), nul))
    var data = this._encrypt(Buffer.concat([
      new Buffer([len]),
      new Buffer(this.prefix),
      chunk,
      padding
    ]))

    return util.format(P2PKH_SCPT, data.toString('hex'))
  }.bind(this)))
}

/**
 * Return an array of strings representing this data's encoding in the OpReturn
 * bitcoin output format
 *
 * @function
 * @return {Array}
 */
TxEncoder.prototype.toOpReturn = function () {
  if ((this.data.length + this.prefix.length) > BYTES_IN_OPRETURN) {
    throw new DataTooLargeError()
  }

  var data = this._encrypt(Buffer.concat([
    new Buffer(this.prefix),
    this.data
  ]))

  return this._p2pkhWrap(util.format(OP_RETURN_SCPT, data.toString('hex')))
}

module.exports = {
  TxEncoder: TxEncoder,
  MissingSenderPubKeyError: MissingSenderPubKeyError,
  MissingSenderAddrError: MissingSenderAddrError,
  DataTooLargeError: DataTooLargeError,
  InvalidGenPublicKeyError: InvalidGenPublicKeyError,
  BYTES_IN_MULTISIG: BYTES_IN_MULTISIG,
  BYTES_IN_PUBKEYHASH: BYTES_IN_PUBKEYHASH,
  BYTES_IN_OPRETURN: BYTES_IN_OPRETURN
}
