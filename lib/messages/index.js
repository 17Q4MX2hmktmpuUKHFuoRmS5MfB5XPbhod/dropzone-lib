var async = require('async')
var extend = require('shallow-extend')
var blockchain = require('../blockchain')
var tx_decoder = require('../tx_decoder')
var cache = require('../cache')

var Message = require('./message')
var Chat = require('./chat')

var TxDecoder = tx_decoder.TxDecoder
var TxCache = cache.models.Tx
var TipCache = cache.models.Tip

var BadDecodingError = tx_decoder.BadDecodingError
var BadEncodingError = tx_decoder.BadEncodingError

var match = function (data) {
  var types = [Message, Chat]
  var prefix = /^([a-z0-9]{6})/i
  if (data) {
    var match = data.toString().match(prefix)
    if (match) {
      for (var t = types.length; --t;) {
        if (match[1] === types[t].prefix) {
          return types[t]
        }
      }
    }
  }
  return Message
}

var resolve = function (tx, network) {
  try {
    extend(tx, new TxDecoder(tx, {
      prefix: Message.prefix,
      network: network
    }))
    var MessageType = match(tx.data)
    tx.txId = tx.hash
    return MessageType.fromTx(tx, network) 
  } catch (err) {
    if (err instanceof BadDecodingError ||
      err instanceof BadEncodingError) {
      return new Message({})
    }
    throw err
  }
}

var find = function (query, addr, network, next) {
  query = query || {}
  async.waterfall([ function (next) {
    TxCache.find(query, 'blockHeight', function (err, txs) {
      if (err) return next(err)
      next(null, txs.map(function (tx) {
        var MessageType = match(tx.data)
        return MessageType.fromTx(tx, network)
      }).filter(function (a) {
        return a.isValid()
      }))
    })
  }, function (ctxs, next) {
    TipCache.one({
      relevantAddr: addr.toString()
    }, function (err, tip) {
      next(err, ctxs, tip)
    })
  }, function (ctxs, tip, next) {
    var opts = { tip: tip }
    blockchain.getTxsByAddr(addr, opts, function (err, txs, ntip) {
      if (err) return next(err)
      txs = ctxs.concat(txs.map(function (tx) {
        return resolve(tx, network)
      }).filter(function (a, x, c) {
        return a.isValid() && a.isUnique(x, c)
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

var watch = function (addr, next) {
  blockchain.watchTxsByAddr(addr, function (err, tx) {
    if (err) return next(err)
    var message = resolve(tx, addr.network)
    if (message.isValid()) {
      return next(null, message)
    }
  })
}

module.exports = {
  Message: Message,
  Chat: Chat,
  match: match,
  resolve: resolve,
  find: find,
  watch: watch
}
