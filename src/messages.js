var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore')
var blockchain = require('./blockchain')
var tx_decoder = require('./tx_decoder')
var cache = require('./cache')

var BufferReader = bitcore.encoding.BufferReader
var BufferWriter = bitcore.encoding.BufferWriter
var Address = bitcore.Address
var Blockchain = blockchain.Blockchain
var TxDecoder = tx_decoder.TxDecoder
var TxCache = cache.models.Tx
var TipCache = cache.models.Tip

var BadEncodingError = tx_decoder.BadEncodingError

var Messages = {}

var MSGS_PREFIX = 'DZ'
var CHATMSG_PREFIX = 'COMMUN'
var CIPHER_ALGORITHM = 'AES-256-CBC'

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
          if (tip.id) {
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
    var attrib = buf.readVarLengthBuffer()
    var value = buf.readVarLengthBuffer()
    this[this.attribs[attrib.toString()]] = value
  }
  this.isInit = !!(this.der && this.sessionPrivKey)
  this.isAuth = !!this.sessionPrivKey
}

ChatMessage.prototype.toBuffer = function (network) {
  var buf = new BufferWriter(new Buffer(CHATMSG_PREFIX), 'ascii')
  for (var key in this) {
    var value = this[key]
    if (value === parseInt(value, 10)) {
      buf.writeVarintNum(value)
    } else if (Address.isValid(value, network, 'pubkey')) {
      buf.write(new Buffer(value.toObject().hash))
    } else {
      buf.write(new Buffer(value.toString()))
    }
  }
}

ChatMessage.prototype.getPlain = function (symmKey) {
  var key = symmKey.slice(0, 32)
  var decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, this.iv)
  return Buffer.concat([
    decipher.update(this.contents),
    decipher.final()
  ]).toString('utf-8')
}

ChatMessage.prototype.send = function (privKey, network, next) {
  // var payload = this.toBuffer(network)
  var addr = privKey.toAddress(network)
  Blockchain.getUtxosByAddr(addr, function (err, utxos) {
    if (err) return next(err)
  /*
  var outputs = new TxEncoder()
  Blockchain.pushTx(outputs, privKey, next)
  */
  })
}

module.exports = {
  Messages: Messages,
  Message: Message,
  ChatMessage: ChatMessage
}
