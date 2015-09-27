var async = require('async')
var network = require('./network')
var filter = require('./filter')
var cache = require('./cache')

var Network = network.Network
var BloomFilter = filter.BloomFilter
var TxoCache = cache.models.Txo
var TipCache = cache.models.Tip

var Blockchain = {}

Blockchain.getTxsByAddr = function (addr, tip, next) {
  var filter = BloomFilter.create(1, 0.2, 0, BloomFilter.BLOOM_UPDATE_ALL)
  filter.insertAddress(addr)
  new Network({ network: addr.network }).getFilteredTxs(filter, tip, next)
}

Blockchain.getUtxosByAddr = function (addr, next) {
  var query = {
    spenderAddr: addr.toString()
  }
  TxoCache.find(query, 'blockHeight', function (err, ctxos) {
    if (err) return next(err)
    var cutxos = []
    cutxos = cutxos.concat(ctxos.filter(function (txo) {
      return !txo.spent
    }))
    TipCache.one({
      relevantAddr: addr.toString(),
      subject: 'txo'
    }, function (err, tip) {
      if (err) return next(err)
      if (!tip && ctxos.length) {
        var lastTxo = ctxos[ctxos.length - 1]
        tip = {
          blockId: lastTxo.blockId,
          blockHeight: lastTxo.blockHeight
        }
      }
      Blockchain.getTxsByAddr(addr, tip, function (err, txs, ntip) {
        if (err) return next(err)
        var txids = {}
        for (var tx, t = 0, tl = txs.length; t < tl; t++) {
          tx = txs[t]
          txids[tx.hash.toString('hex')] = tx
        }
        var txos = Blockchain.txosFromTxs(addr, txids)
        var utxos = Blockchain.utxosFromTxTxos(addr, txids, txos)
        async.each(txos, function (txoArr, next) {
          async.each(txoArr, function (txo, next) {
            var txid = txo.tx.hash.toString('hex')
            var index = txo.index
            var ctxo = {
              txId: txid,
              spenderAddr: txo.script.toAddress(addr.network).toString(),
              index: index,
              satoshis: txo.satoshis,
              spent: !(txid in utxos) ||
                !utxos[txid].filter(function (utxo) {
                  return utxo.index === txo.index
                }).length,
              isTesting: addr.network.name === 'testnet',
              blockId: txo.tx.block.hash,
              blockHeight: txo.tx.block.height
            }
            TxoCache.create(ctxo, function (err) {
              if (err) return next(err)
              ctxos.push(ctxo)
              if (!ctxo.spent) {
                cutxos.push(ctxo)
              }
              next(null)
            })
          }, next)
        }, function (err) {
          if (err) return next(err)
          if (tip && tip.id) {
            tip.blockId = ntip.blockId
            tip.blockHeight = ntip.blockHeight
            return tip.save(function (err) {
              next(err, cutxos)
            })
          }
          TipCache.create({
            relevantAddr: addr.toString(),
            subject: 'txo',
            blockId: ntip.blockId,
            blockHeight: ntip.blockHeight
          }, function (err) {
            next(err, cutxos)
          })
        })
      })
    })
  })
}

Blockchain.txosFromTxs = function (addr, txids) {
  var addrStr = addr.toString()
  var txos = {}
  var txoArr
  var tx
  var scptAddr
  for (var txid in txids) {
    tx = txids[txid]
    txoArr = tx.outputs.map(function (txo, n) {
      txo.index = n
      txo.tx = tx
      return txo
    }).filter(function (txo) {
      scptAddr = txo.script.toAddress(addr.network)
      return scptAddr.toString() === addrStr
    })
    if (txoArr.length) {
      txos[txid] = txoArr
    }
  }
  return txos
}

Blockchain.utxosFromTxTxos = function (addr, txids, txos) {
  var addrStr = addr.toString()
  var txis = {}
  var tx
  var txid
  var ptxid
  var scptAddr
  for (txid in txids) {
    tx = txids[txid]
    for (var txi, i = 0, il = tx.inputs.length; i < il; i++) {
      txi = tx.inputs[i]
      scptAddr = txi.script.toAddress(addr.network)
      if (scptAddr.toString() !== addrStr) {
        continue
      }
      ptxid = txi.prevTxId.toString('hex')
      txis[ptxid] = txis[ptxid] || []
      txis[ptxid].push(txi)
    }
  }
  var utxos = {}
  var utxoArr
  for (txid in txos) {
    utxoArr = txos[txid].filter(function (txo) {
      return !(txid in txis) ||
      !txis[txid].filter(function (txi) {
        return txi.outputIndex === txo.index
      }).length
    })
    if (utxoArr.length) {
      utxos[txid] = utxoArr
    }
  }
  return utxos
}

Blockchain.pushTx = function (data, privKey, next) {}

module.exports = {
  Blockchain: Blockchain
}
