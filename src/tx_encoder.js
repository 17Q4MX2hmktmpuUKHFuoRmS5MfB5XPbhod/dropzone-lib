var crypto = require('crypto')
var util = require('util')
var bitcore = require('bitcore')
var network = require('./network')

var Address = bitcore.Address
var PublicKey = bitcore.PublicKey
var Base58Check = bitcore.encoding.Base58Check
var Hash = bitcore.crypto.Hash

var DEFAULT_PREFIX = 'CNTRPRTY'

var P2PKH = 'OP_DUP OP_HASH160 %s OP_EQUALVERIFY OP_CHECKSIG'
var MULTISIG = '1 %s %s OP_CHECKMULTISIG'
var OPRETURN = 'OP_RETURN %s'

/* 33 is the size of a pubkey, there are two pubkeys in a multisig, 1 byte
   is lost for the data length byte, and two bytes are lost on each key for
   the data_to_pubkey inefficiency */
var BYTES_IN_MULTISIG = (33 * 2) - 1 - 2 - 2
var BYTES_IN_PUBKEYHASH = 20 - 1
var BYTES_IN_OPRETURN = 40

util.inherits(TxEncoderError, Error)

function TxEncoderError (message) {
  this.name = this.constructor.name
  this.message = 'Transaction encoder error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function BadEncodingError () {
  TxEncoderError.call(this, 'invalid parameters')
}

function TxEncoder (key, data, options) {
  this.key = key
  this.data = data

  options = options || {}
  this.prefix = options.prefix || DEFAULT_PREFIX
  this.network = options.network || network.main

  this.encryptKey = key
  this.sourceData = data

  if (options.senderPubkey) {
    this.senderPubkey = options.senderPubkey
    this.senderAddr = Address.fromPublicKey(new PublicKey(this.senderPubkey), 
        this.network)
  } else if (options.senderAddr) {
    this.senderAddr = options.senderAddr
  } else {
    // Missing Sender Address:
    throw new BadEncodingError()
  }

  if (options.receiverAddr)
    this.receiverAddr = options.receiverAddr
}

/* Take a too short data pubkey and make it look like a real pubkey.
 * Take an obfuscated chunk of data that is two bytes too short to be a pubkey and
 * add a sign byte to its beginning and a nonce byte to its end. Choose these
 * bytes so that the resulting sequence of bytes is a fully valid pubkey (i.e. on
 * the ECDSA curve). Find the correct bytes by guessing randomly until the check
 * passes. (In parsing, these two bytes are ignored.)
 *
 * NOTE: This function is named "make_fully_valid" in the official code. */
TxEncoder.prototype.dataToPubkey = function (bytes) {
  if (bytes.length != 31)
    throw new BadEncodingError()

  random_bytes = Hash.sha256(bytes)

  // Deterministically generated, for unit tests.
  sign = (random_bytes[0] & 1) + 2

  nonce = initial_nonce = random_bytes[1]

  do {
    nonce++
    if (nonce == initial_nonce)
      continue;

    // 33 is the size of a pubkey
    ret = new Buffer(33)
    ret.writeUInt8(sign, 0)
    bytes.copy(ret, 1)
    ret.writeUInt8(nonce % 256, 32)

  } while (Address.isValid(ret))

  // I don't actually think this is ever possible. Note that we return 66 bytes
  // as this is string of hex, and not the bytes themselves:
  if (ret.length != 33)
    throw new BadEncodingError()

  return ret
}

/* This is a little helper method that lets us split our binary data into 
 * chunks for further processing */
TxEncoder.prototype.collectChunks = function (data, chunkLength, callback) {
  var chunks = new Array(Math.ceil(data.length / chunkLength))

  for (i = 0; i < chunks.length; i++) { 
    var start = i*chunkLength
    chunks[i] = callback(data.slice(start, start+chunkLength))
  }

  return chunks
}

TxEncoder.prototype.p2pkhWrap = function (operation) {
  addresses = [this.receiverAddr, this.senderAddr].map(function(addr) { 
    return (addr) ? util.format( P2PKH,
      Base58Check.decode(addr.toString()).toString('hex').slice(2,42) ) : null
  })

  return [].concat(
    (addresses[0]) ? addresses[0] : null, operation,
    (addresses[1]) ? addresses[1] : null).filter(Boolean)
}

TxEncoder.prototype.encrypt = function (data) {
  var cipher = crypto.createCipher('rc4', this.encryptKey)
  return Buffer.concat([cipher.update(data), cipher.final()])
}

TxEncoder.prototype.toOpMultisig = function () {

  if (!this.senderPubkey)
    throw new BadEncodingError()

  data_length = BYTES_IN_MULTISIG-this.prefix.length
  var that = this

  operations = this.collectChunks(this.sourceData, data_length, function (chunk) {
    var new_chunk = new Buffer(BYTES_IN_MULTISIG+1) // not so sure about that +1
    new_chunk.fill(0)
    new_chunk.writeUInt8(chunk.length+that.prefix.length, 0)
    new_chunk.write(that.prefix, 1)
    chunk.copy(new_chunk, 1+that.prefix.length)

    new_chunk = that.encrypt(new_chunk)

    var multisig_keys = [that.dataToPubkey(new_chunk.slice(0,31)).toString('hex'), 
      that.dataToPubkey(new_chunk.slice(31)).toString('hex'),
      that.senderPubkey]

    return util.format(MULTISIG, multisig_keys.join(' '), 3)
  })

  return this.p2pkhWrap(operations)
}

TxEncoder.prototype.toOpReturn = function () {
  return null
  /*
  # I'm fairly certain that using more than one OP_RETURN per transaction is
  # unstandard behavior right now
  raise DataTooLarge if (source_data.length + prefix.length) > BYTES_IN_OPRETURN

  data = encrypt [prefix,source_data].join

  p2pkh_wrap( OPRETURN % data.unpack('H*').first )
  */
}

TxEncoder.prototype.toOpCheckSig = function () {
  return null
  /*
  p2pkh_wrap collect_chunks(source_data, BYTES_IN_PUBKEYHASH-prefix.length){ |chunk|
    data_length = prefix.length + chunk.length

    padding = 0.chr * (BYTES_IN_PUBKEYHASH - data_length)

    enc_chunk = encrypt [(data_length).chr, prefix, chunk, padding].join

    P2PKH % enc_chunk.unpack('H*').first
  }
  */
}

module.exports = {
  TxEncoder: TxEncoder,
  BadEncodingError: BadEncodingError
}
