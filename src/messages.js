var async = require('async')
var bitcore = require('bitcore')
var blockchain = require('./blockchain')
var tx_decoder = require('./tx_decoder')
var cache = require('./cache')

var BufferReader = bitcore.encoding.BufferReader
var Blockchain = blockchain.Blockchain
var TxDecoder = tx_decoder.TxDecoder
var TxCache = cache.models.Tx

var BadEncodingError = tx_decoder.BadEncodingError

var Messages = {}

var MSGS_PREFIX = 'DZ'

Messages.find = function (query, network, next) {
  query = query || {}
  var queries = [query]
  var addr = query.addr
  if (query.addr) {
    var strAddr = query.addr.toString()
    queries = [{ senderAddr: strAddr }, { receiverAddr: strAddr }]
  }
  async.waterfall([function (next) {
    async.concat(queries, function (query, next) {
      TxCache.find(query, 'blockHeight', next)
    }, function (err, txs) {
      if (err) return next(err)
      txs = txs.map(function (tx) {
        return Message.fromCachedTx(tx, network)
      }).filter(Message.isValid)
      next(null, txs)
    })
  }, function (ctxs, next) {
    var tip
    if (ctxs.length) {
      for (var cachedTx, c = ctxs.length; c--;) {
        if (ctxs[c].blockId) {
          cachedTx = ctxs[c]
          break
        }
      }
      if (cachedTx) {
        tip = {
          hash: cachedTx.blockId,
          height: cachedTx.blockHeight
        }
      } else {
        ctxs = []
      }
    }
    Blockchain.getTxsByAddr(addr, tip, function (err, txs) {
      if (err) return next(err)
      txs = txs.map(function (tx) {
        return Message.fromTx(tx, network)
      }).filter(Message.isValid)
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
        next(err, txs)
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
    if (match[1] === 'COMMUN') {
      msg = new CommunicationMessage()
      msg.fromBuffer(params.data.slice(6))
    }
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

function CommunicationMessage () {
  this.attribs = {
    i: 'iv',
    c: 'contents',
    d: 'der',
    p: 'sessionPrivKey'
  }
}

CommunicationMessage.prototype.fromBuffer = function (data) {
  var buf = new BufferReader(data)
  while (!buf.eof()) {
    var attrib = buf.readVarLengthBuffer()
    var value = buf.readVarLengthBuffer()
    this[this.attribs[attrib.toString()]] = value.toString()
  }
  this.isInit = !!(this.der && this.sessionPrivKey)
}

module.exports = {
  Messages: Messages,
  Message: Message
}
