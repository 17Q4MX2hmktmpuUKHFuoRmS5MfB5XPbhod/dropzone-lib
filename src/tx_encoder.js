var util = require('util')
var bitcore = require('bitcore')
var network = require('./network')

var Address = bitcore.Address
var PublicKey = bitcore.PublicKey

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
  this.sourceDate = data

  if (options.senderPubkey) {
    this.senderPubkey = options.senderPubkey
    this.senderAddr = Address.fromPublicKey(new PublicKey(this.senderPubkey))
  } else if (options.senderAddr) {
    this.senderAddr = options.senderAddr
  } else {
    // Missing Sender Address:
    throw new BadEncodingError()
  }

  if (options.receiverAddr) {
    this.receiverAddr = options.receiverAddr
  }
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
  /*
  raise InvalidPubkey unless bytes.length == 31

  random_bytes = Digest::SHA256.digest bytes

  # Deterministically generated, for unit tests.
  sign = (random_bytes[0].ord & 1) + 2
  nonce = initial_nonce = random_bytes[1].ord

  begin
    nonce += 1
    next if nonce == initial_nonce

    ret = (sign.chr + bytes + (nonce % 256).chr).unpack('H*').first

  # Note that 256 is the exclusive limit:
  end until Bitcoin.valid_pubkey? ret

  # I don't actually think this is ever possible. Note that we return 66 bytes
  # as this is string of hex, and not the bytes themselves:
  raise InvalidPubkeyGenerated unless ret.length == 66

  ret
  */
}

/* This is a little helper method that lets us split our binary data into 
 * chunks for further processing */
TxEncoder.prototype.collectChunks = function (data,chunk_length, block) {
  /*
  (source_data.length.to_f / chunk_length).ceil.times.collect{|i| 
    block.call source_data.slice(i*chunk_length, chunk_length) }
  */
}

TxEncoder.prototype.p2pkhWrap = function (operation) {
  /*
  [ (receiver_addr) ? P2PKH % Bitcoin.hash160_from_address(receiver_addr) : nil, 
    operation,
    P2PKH % Bitcoin.hash160_from_address(sender_addr) ].flatten.compact
  */
}

TxEncoder.prototype.encrypt = function (chunk) {
  /*
  RC4.new(encrypt_key).encrypt chunk
  */
}

TxEncoder.prototype.toOpMultisig = function () {
  return null

  /*
  raise MissingPubkey unless sender_pubkey

  data_length = BYTES_IN_MULTISIG-prefix.length
  p2pkh_wrap collect_chunks(source_data,data_length){|chunk| 
    padding = 0.chr * (data_length-chunk.length)

    data = encrypt [(chunk.length+prefix.length).chr,prefix, chunk, padding].join

    data_keys = [(0...31), (31...62)].collect{|r| data_to_pubkey data[r] }

    MULTISIG % [(data_keys + [sender_pubkey]).join(' '), 3]
  }
  */
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
