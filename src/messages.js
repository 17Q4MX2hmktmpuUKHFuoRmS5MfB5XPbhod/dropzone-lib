var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore')
var blockchain = require('./blockchain')
var tx_decoder = require('./tx_decoder')
var tx_encoder = require('./tx_encoder')
var cache = require('./cache')

var BufferReader = bitcore.encoding.BufferReader
var BufferWriter = bitcore.encoding.BufferWriter
var Address = bitcore.Address
var Script = bitcore.Script
var Transaction = bitcore.Transaction
var Output = bitcore.Transaction.Output
var Blockchain = blockchain.Blockchain
var TxDecoder = tx_decoder.TxDecoder
var TxEncoder = tx_encoder.TxEncoder
var TxCache = cache.models.Tx
var TipCache = cache.models.Tip

var InvalidStateError = bitcore.errors.InvalidState
var BadEncodingError = tx_decoder.BadEncodingError

function MessagesError (message) {
  this.name = this.constructor.name
  this.message = 'Messages error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function InsufficientBalanceError () {
  MessagesError.call(this, 'insufficient balance to make a transaction')
}

var Messages = {}

var MSGS_PREFIX = 'DZ'
var CHATMSG_PREFIX = 'COMMUN'
var CIPHER_ALGORITHM = 'AES-256-CBC'
var TXO_DUST = 5430

Messages.find = function (query, addr, network, next) {
  query = query || {}
  async.waterfall([ function (next) {
    TxCache.find(query, 'blockHeight', function (err, txs) {
      if (err) return next(err)
      next(null, txs.map(function (tx) {
        return Message.fromCachedTx(tx, network)
      }).filter(function (a, x, c) {
        return !c.filter(function (b, y) {
          return a.txId === b.txId && x > y
        }).length
      }).sort(function (a, b) {
        return a.blockHeight - b.blockHeight
      }))
    })
  }, function (ctxs, next) {
    TipCache.one({
      relevantAddr: addr.toString(),
      subject: 'tx'
    }, function (err, tip) {
      if (err) return next(err)
      if (!tip && ctxs.length) {
        for (var cachedTx, c = ctxs.length; c--;) {
          if (ctxs[c].blockId) {
            cachedTx = ctxs[c]
            break
          }
        }
        if (cachedTx) {
          tip = {
            blockId: cachedTx.blockId,
            blockHeight: cachedTx.blockHeight
          }
          ctxs = ctxs.slice(0, c + 1)
        } else {
          ctxs = []
        }
      }
      Blockchain.getTxsByAddr(addr, tip, function (err, txs, ntip) {
        if (err) return next(err)
        txs = txs.map(function (tx) {
          return Message.fromTx(tx, network)
        }).sort(function (a, b) {
          return a.blockHeight - b.blockHeight
        })
        txs = ctxs.concat(txs)
        async.each(txs, function (tx, next) {
          TxCache.one({ txId: tx.txId }, function (err, ctx) {
            if (err) throw err
            if (ctx) {
              ctx.blockId = tx.blockId
              return ctx.save(next)
            }
            TxCache.create({
              txId: tx.txId,
              receiverAddr: tx.receiverAddr,
              senderAddr: tx.senderAddr,
              data: tx.data,
              isTesting: tx.isTesting,
              blockId: tx.blockId,
              blockHeight: tx.blockHeight
            }, next)
          })
        }, function (err) {
          if (err) return next(err)
          if (tip && tip.id) {
            tip.blockId = ntip.blockId
            tip.blockHeight = ntip.blockHeight
            return tip.save(function (err) {
              next(err, txs.filter(Message.isValid))
            })
          }
          TipCache.create({
            relevantAddr: addr.toString(),
            subject: 'tx',
            blockId: ntip.blockId,
            blockHeight: ntip.blockHeight
          }, function (err) {
            next(err, txs.filter(Message.isValid))
          })
        })
      })
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
    receiverAddr: ctx.receiverAddr,
    senderAddr: ctx.senderAddr,
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
      receiverAddr: record.receiverAddr.toString(),
      senderAddr: record.senderAddr.toString(),
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
  var payload = this.toBuffer()
  var network = this.receiverAddr.network
  var addr = privKey.toAddress(network)
  var pubKey = privKey.toPublicKey()
  Blockchain.getUtxosByAddr(addr, function (err, utxos) {
    if (err) return next(err)
    var outputBytes = tx_encoder.BYTES_IN_MULTISIG
    var outputNum = 2 + Math.ceil((payload.length + 3) / outputBytes)
    var fee = 20000
    var total = (outputNum * TXO_DUST) + fee
    var tx = new Transaction()
    var allocated = 0
    var txis = []
    var utxo

    utxos.reverse()

    for (var i = 0, l = utxos.length; i < l; i++) {
      utxo = utxos[i]
      allocated += utxo.satoshis
      txis.push({
        address: addr,
        txId: utxo.txId,
        outputIndex: utxo.index,
        satoshis: utxo.satoshis,
        script: utxo.script
      })
      utxo.spent = true
      if (allocated >= total) {
        break
      }
    }
    if (allocated < total) {
      return next(new InsufficientBalanceError())
    }

    tx.from(txis)

    var txoScpts = new TxEncoder(tx.inputs[0].prevTxId, payload, {
      receiverAddr: this.receiverAddr,
      senderPubKey: pubKey,
      prefix: MSGS_PREFIX
    }).toOpMultisig()

    var txoScpt
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

    Blockchain.pushTx(tx, addr.network, function (err, tx) {
      if (err) return next(err)
      async.each(utxos, function (utxo, next) {
        utxo.save(next)
      }, function (err) {
        next(err, tx)
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
