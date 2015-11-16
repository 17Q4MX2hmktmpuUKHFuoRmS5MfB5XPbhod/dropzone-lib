var bitcore = require('bitcore-lib')
var async = require('async')
var gate = require('json-gate')
var extend = require('shallow-extend')
var blockchain = require('../blockchain')
var tx_encoder = require('../tx_encoder')
var cache = require('../cache')

var Address = bitcore.Address
var Script = bitcore.Script
var Transaction = bitcore.Transaction
var MultiSigInput = bitcore.Transaction.Input.MultiSig
var PublicKey = bitcore.PublicKey
var Output = bitcore.Transaction.Output
var BufferReader = bitcore.encoding.BufferReader
var BufferWriter = bitcore.encoding.BufferWriter
var TxEncoder = tx_encoder.TxEncoder
var TxoCache = cache.models.Txo

var InvalidStateError = bitcore.errors.InvalidState

var TXO_DUST = 5430
var MSG_PREFIX = 'DZ'

function MessagesError (message) {
  this.name = this.constructor.name
  this.message = 'Messages error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function InsufficientBalanceError () {
  MessagesError.call(this, 'insufficient balance to make a transaction')
}

var messageSchema = gate.createSchema({
  id: '/Message',
  type: 'object',
  properties: {
    messageType: { type: 'string' },
    txId: { type: 'string' },
    senderAddr: { type: 'string' },
    receiverAddr: { type: 'string' }
  }
})

var Message = function Message (params) {
  extend(this, params)
  this.validate(this)

  if (this.senderAddr) {
    this.senderAddr = new Address(this.senderAddr)
  }

  if (this.receiverAddr) {
    this.receiverAddr = new Address(this.receiverAddr)
  }
}

Message.prefix = MSG_PREFIX

Message.fromTx = function (tx, network) {
  var MessageType = this
  return new MessageType({
    txId: tx.txId,
    data: tx.data,
    receiverAddr: tx.receiverAddr.toString(),
    senderAddr: tx.senderAddr.toString(),
    blockId: tx.block && tx.block.hash,
    blockHeight: tx.block && tx.block.height,
    isTesting: network.name === 'testnet'
  })
}

Message.prototype.attributes = {}

Message.prototype.validate = function (input) {
  messageSchema.validate(input)
}

Message.prototype.isValid = function () {
  return Object.keys(this).length
}

Message.prototype.isUnique = function (x, messages) {
  var a = this
  return !messages.filter(function (b, y) {
    return b.isValid() && a.txId === b.txId && x > y
  }).length
}

Message.prototype.fromBuffer = function (data) {
  if (!data || !data.length) return
  var buf = new BufferReader(data.slice(6))
  while (!buf.eof()) {
    try {
      var attrib = buf.readVarLengthBuffer()
      var value = buf.readVarLengthBuffer()
      this[this.attributes[attrib.toString()]] = value
    } catch (err) {
      if (err instanceof InvalidStateError) {
        return
      }
      throw err
    }
  }
}

Message.prototype.toObject = function () {
  return {
    txId: this.txId,
    receiverAddr: this.receiverAddr.toString(),
    senderAddr: this.senderAddr.toString(),
    data: this.data,
    isTesting: this.isTesting,
    blockId: this.blockId,
    blockHeight: this.blockHeight
  }
}

Message.prototype.toBuffer = function () {
  var MessageType = this.constructor
  var network = this.receiverAddr.network
  var buf = new BufferWriter()
  buf.write(new Buffer(MessageType.prefix))
  var revAttr = {}
  var chunk
  for (var attr in this.attributes) {
    revAttr[this.attributes[attr]] = attr
  }
  for (var key in this) {
    if (key in revAttr) {
      var value = this[key]
      if (value) {
        chunk = new Buffer(revAttr[key])
        buf.writeVarintNum(chunk.length)
        buf.write(chunk)
      }
      if (value === parseInt(value, 10)) {
        buf.writeVarintNum(value)
      } else if (Address.isValid(value, network, 'pubkey')) {
        chunk = new Buffer(value.toObject().hash, 'hex')
        buf.writeVarintNum(chunk.length)
        buf.write(chunk)
      } else if (value) {
        buf.writeVarintNum(value.length)
        buf.write(value)
      }
    }
  }
  return buf.toBuffer()
}

Message.prototype.send = function (privKey, next) {
  var MessageType = this.constructor
  next = next || function () {}

  var payload = this.toBuffer()
  var network = this.receiverAddr.network
  var addr = privKey.toAddress(network)
  var pubKey = privKey.toPublicKey()

  var PushTxTimeoutError = blockchain.PushTxTimeoutError

  blockchain.getUtxosByAddr(addr, function (err, utxos) {
    if (err) return next(err)
    var bytes = tx_encoder.BYTES_IN_MULTISIG
    var outn = 2 + Math.ceil((payload.length + 3) / bytes)
    var fee = 20000
    var total = (outn * TXO_DUST) + fee
    var tx = new Transaction()
    var allocated = 0
    var txos = []
    var opCount
    var pubKeys
    var txoScpt
    var utxo

    utxos = utxos.sort(function (a, b) {
      return a.satoshis - b.satoshis
    })

    for (var i = 0, l = utxos.length; i < l; i++) {
      utxo = utxos[i]
      allocated += utxo.satoshis
      txoScpt = Script.fromBuffer(utxo.script)
      if (txoScpt.isMultisigOut()) {
        opCount = txoScpt.getSignatureOperationsCount()
        pubKeys = txoScpt.chunks.slice(1, 1 + opCount).map(function (pubKey) {
          return PublicKey.fromBuffer(pubKey.buf)
        })
        tx.addInput(new MultiSigInput({
          output: new Output({
            script: utxo.script,
            satoshis: utxo.satoshis
          }),
          prevTxId: utxo.txId,
          outputIndex: utxo.index,
          script: utxo.script,
          publicKeys: pubKeys,
          threshold: 1
        }))
      } else {
        tx.from({
          address: addr,
          txId: utxo.txId,
          outputIndex: utxo.index,
          satoshis: utxo.satoshis,
          script: utxo.script
        })
      }
      txos.push(utxo)
      if (allocated >= total) {
        break
      }
    }
    if (allocated < total) {
      return next(new InsufficientBalanceError())
    }

    var txoScpts = new TxEncoder(tx.inputs[0].prevTxId, payload, {
      receiverAddr: this.receiverAddr,
      senderPubKey: pubKey,
      prefix: Message.prefix
    }).toOpMultisig()

    var satoshis

    for (i = 0, l = txoScpts.length; i < l; i++) {
      txoScpt = Script.fromASM(txoScpts[i])
      satoshis = i === l - 1
        ? allocated - fee - (TXO_DUST * (l - 1))
        : TXO_DUST
      tx.addOutput(new Output({
        satoshis: satoshis,
        script: txoScpt
      }))
    }

    tx.fee(fee)
    tx.sign(privKey)

    var opts = { network: addr.network }
    blockchain.pushTx(tx, opts, function (err, tx) {
      if (err instanceof PushTxTimeoutError) {
        console.log('tx dump:', tx.toString())
        return next(err)
      }
      if (err) return next(err)
      async.each(txos, function (utxo, next) {
        utxo.isSpent = true
        utxo.save(next)
      }, function (err) {
        if (err) return next(err)
        async.eachOf(tx.outputs.slice(1), function (txo, index, next) {
          TxoCache.create({
            txId: tx.id,
            spenderAddr: addr.toString(),
            index: index + 1,
            script: txo.script.toBuffer(),
            satoshis: txo.satoshis,
            isTesting: addr.network.name === 'testnet',
            isSpent: false
          }, next)
        }, function (err) {
          next(err, tx)
        })
      })
    })
  }.bind(this))
}

module.exports = Message
