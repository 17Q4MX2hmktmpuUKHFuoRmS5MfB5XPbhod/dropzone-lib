var async = require('async')
var network = require('./network')
var filter = require('./filter')
var cache = require('./cache')

var Network = network.Network
var BloomFilter = filter.BloomFilter
var TxoCache = cache.models.Txo
var TipCache = cache.models.Tip

var Blockchain = {}

Blockchain.pushTx = function (tx, network, next) {
  next = next || function () {}
  new Network({ network: network }).pushTx(tx, next)
}

Blockchain.getTxsByAddr = function (addr, tip, next) {
  var filter = BloomFilter.create(1, 0.2, 0, BloomFilter.BLOOM_UPDATE_ALL)
  filter.insertAddress(addr)
  var network = new Network({ network: addr.network })
  network.getFilteredTxs(filter, tip, function (err, txs, ntip) {
    if (err) return next(err)
    ntip.relevantAddr = addr.toString()
    next(null, txs, ntip)
  })
}

Blockchain.getUtxosByAddr = function (addr, next) {
  var query = {
    spenderAddr: addr.toString()
  }
  async.waterfall([ function (next) {
    TxoCache.find(query, 'blockHeight', next)
  }, function (ctxos, next) {
    TipCache.one({
      relevantAddr: addr.toString(),
      subject: 'txo'
    }, function (err, tip) {
      next(err, ctxos, tip)
    })
  }, function (ctxos, tip, next) {
    Blockchain.getTxsByAddr(addr, tip, function (err, txs, ntip) {
      next(err, ctxos, tip, txs, ntip)
    })
  }, function (ctxos, tip, txs, ntip, next) {
    var txids = {}
    for (var tx, t = 0, tl = txs.length; t < tl; t++) {
      tx = txs[t]
      txids[tx.hash.toString('hex')] = tx
    }
    var txos = Blockchain.txosFromTxs(addr, txids)
    var utxos = Blockchain.utxosFromTxos(addr, txids, txos)
    var cutxos = ctxos.filter(function (txo) {
      return !txo.spent
    })
    next(null, txos, utxos, cutxos, tip, ntip)
  }, function (txos, utxos, cutxos, tip, ntip, next) {
    async.each(txos, function (txoArr, next) {
      async.each(txoArr, function (txo, next) {
        var txid = txo.tx.hash.toString('hex')
        var spenderAddr = txo.script.toAddress(addr.network).toString()
        var index = txo.index
        TxoCache.create({
          txId: txid,
          spenderAddr: spenderAddr,
          index: index,
          script: txo.script.toBuffer(),
          satoshis: txo.satoshis,
          spent: !(txid in utxos) ||
            !utxos[txid].filter(function (utxo) {
              return utxo.index === txo.index
            }).length,
          isTesting: addr.network.name === 'testnet',
          blockId: txo.tx.block.hash,
          blockHeight: txo.tx.block.height
        }, function (err) {
          if (err) return next(err)
          TxoCache.one({
            txId: txid,
            spenderAddr: spenderAddr,
            index: index
          }, function (err, ctxo) {
            if (err) return next(err)
            if (!ctxo.spent) {
              cutxos.push(ctxo)
            }
            next(null)
          })
        })
      }, next)
    }, function (err) {
      next(err, cutxos, tip, ntip)
    })
  }, function (cutxos, tip, ntip, next) {
    TipCache.setTip('txo', tip, ntip, function (err) {
      next(err, cutxos)
    })
  }], next)
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

Blockchain.utxosFromTxos = function (addr, txids, txos) {
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

module.exports = {
  Blockchain: Blockchain
}
