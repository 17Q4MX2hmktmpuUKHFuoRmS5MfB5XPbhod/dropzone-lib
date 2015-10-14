var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore')
var tx_decoder = require('./tx_decoder')
var tx_encoder = require('./tx_encoder')
var cache = require('./cache')
var blockchain = require('./blockchain')

var BufferReader = bitcore.encoding.BufferReader
var BufferWriter = bitcore.encoding.BufferWriter
var Address = bitcore.Address
var Script = bitcore.Script
var Transaction = bitcore.Transaction
var MultiSigInput = bitcore.Transaction.Input.MultiSig
var PublicKey = bitcore.PublicKey
var Output = bitcore.Transaction.Output
var TxDecoder = tx_decoder.TxDecoder
var TxEncoder = tx_encoder.TxEncoder
var TxCache = cache.models.Tx
var TipCache = cache.models.Tip
var TxoCache = cache.models.Txo

var InvalidStateError = bitcore.errors.InvalidState
var BadEncodingError = tx_decoder.BadEncodingError

var MSGS_PREFIX = 'DZ'
var CHATMSG_PREFIX = 'COMMUN'
var CIPHER_ALGORITHM = 'AES-256-CBC'
var TXO_DUST = 5430

function MessagesError (message) {
  this.name = this.constructor.name
  this.message = 'Messages error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function InsufficientBalanceError () {
  MessagesError.call(this, 'insufficient balance to make a transaction')
}

var Messages = {}

Messages.find = function (query, addr, network, next) {
  query = query || {}
  async.waterfall([ function (next) {
    TxCache.find(query, 'blockHeight', function (err, txs) {
      if (err) return next(err)
      next(null, txs.map(function (tx) {
        return Message.fromCachedTx(tx, network)
      }).filter(Message.isValid))
    })
  }, function (ctxs, next) {
    TipCache.one({
      relevantAddr: addr.toString()
    }, function (err, tip) {
      next(err, ctxs, tip)
    })
  }, function (ctxs, tip, next) {
    blockchain.getTxsByAddr(addr, tip, function (err, txs, ntip) {
      if (err) return next(err)
      txs = ctxs.concat(txs.map(function (tx) {
        return Message.fromTx(tx, network)
      }).filter(function (a, x, c) {
        return Message.isValid(a) && Message.isUnique(a, x, c)
      }))
      return next(null, txs, tip, ntip)
    })
  }, function (txs, tip, ntip, next) {
    async.each(txs, function (tx, next) {
      TxCache.upsert({ txId: tx.txId },
        tx.toObject ? tx.toObject() : tx, next)
    }, function (err) {
      next(err, txs, tip, ntip)
    })
  }, function (txs, tip, ntip, next) {
    TipCache.setTip(tip, ntip, function (err) {
      next(err, txs)
    })
  }], next)
}

function Message () {}

Message.create = function (params) {
  var msg = new Message()
  var prefix = /^([a-z0-9]{6})/i
  var match = params.data.toString().match(prefix)
  if (match) {
    if (match[1] === CHATMSG_PREFIX) {
      msg = new ChatMessage()
      msg.fromBuffer(params.data.slice(6))
    }
  } else {
    return msg
  }
  for (var key in params) {
    msg[key] = params[key]
  }
  return msg
}

Message.fromCachedTx = function (ctx, network) {
  return Message.create({
    txId: ctx.txId,
    receiverAddr: new Address(ctx.receiverAddr),
    senderAddr: new Address(ctx.senderAddr),
    data: ctx.data,
    blockId: ctx.blockId,
    blockHeight: ctx.blockHeight,
    isTesting: network.name === 'testnet'
  })
}

Message.fromTx = function (tx, network) {
  try {
    var record = new TxDecoder(tx, {
      prefix: MSGS_PREFIX,
      network: network
    })
    return Message.create({
      txId: tx.hash,
      receiverAddr: record.receiverAddr,
      senderAddr: record.senderAddr,
      data: record.data,
      blockId: tx.block.hash,
      blockHeight: tx.block.height,
      isTesting: network.name === 'testnet'
    })
  } catch (err) {
    if (!(err instanceof BadEncodingError)) {
      throw err
    }
    return null
  }
}

Message.isValid = function (message) {
  return Object.keys(message).length
}

Message.isUnique = function (a, x, messages) {
  return !messages.filter(function (b, y) {
    return a.txId === b.txId && x > y
  }).length
}

function ChatMessage (params) {
  params = params || {}
  this.attribs = {
    i: 'iv',
    c: 'contents',
    d: 'der',
    p: 'sessionPrivKey'
  }
  for (var key in params) {
    this[key] = params[key]
  }
}

ChatMessage.prototype.encrypt = function (symmKey) {
  this.iv = crypto.randomBytes(16)
  var key = symmKey.slice(0, 32)
  var cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, this.iv)
  this.contents = Buffer.concat([
    cipher.update(this.contents),
    cipher.final()
  ])
}

ChatMessage.prototype.fromBuffer = function (data) {
  var buf = new BufferReader(data)
  while (!buf.eof()) {
    try {
      var attrib = buf.readVarLengthBuffer()
      var value = buf.readVarLengthBuffer()
      this[this.attribs[attrib.toString()]] = value
    } catch (err) {
      if (err instanceof InvalidStateError) {
        return
      }
      throw err
    }
  }
  this.isInit = !!(this.der && this.sessionPrivKey)
  this.isAuth = !!this.sessionPrivKey
  this.isPrintable = !!(this.contents)
}

ChatMessage.prototype.toObject = function () {
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

ChatMessage.prototype.toBuffer = function () {
  var network = this.receiverAddr.network
  var buf = new BufferWriter()
  buf.write(new Buffer(CHATMSG_PREFIX))
  var revAttr = {}
  var chunk
  for (var attr in this.attribs) {
    revAttr[this.attribs[attr]] = attr
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

ChatMessage.prototype.getPlain = function (symmKey) {
  var key = symmKey.slice(0, 32)
  var decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, this.iv)
  return Buffer.concat([
    decipher.update(this.contents),
    decipher.final()
  ]).toString('utf-8')
}

ChatMessage.prototype.send = function (privKey, next) {
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
          script: Script.empty(),
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
      prefix: MSGS_PREFIX
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

    blockchain.pushTx(tx, addr.network, function (err, tx) {
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

module.exports = {
  Messages: Messages,
  Message: Message,
  ChatMessage: ChatMessage,
  InsufficientBalanceError: InsufficientBalanceError
}
