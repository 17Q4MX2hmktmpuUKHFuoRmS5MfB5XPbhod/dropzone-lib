var async = require('async')
var bitcore = require('bitcore')
var network = require('./network')
var filter = require('./filter')
var cache = require('./cache')

var PublicKey = bitcore.PublicKey
var Network = network.Network
var BloomFilter = filter.BloomFilter
var UtxoCache = cache.models.Utxo
var TipCache = cache.models.Tip

var Blockchain = {}

Blockchain.pushTx = function (tx, network, next) {
  next = next || function () {}
  new Network({ network: network }).pushTx(tx, next)
}

Blockchain.getTxsByAddr = function (addr, tip, next) {
  var filter = BloomFilter.create(1, 0.0001, 0, BloomFilter.BLOOM_UPDATE_ALL)
  filter.insertAddress(addr)
  var network = new Network({ network: addr.network })
  network.getFilteredTxs(filter, tip, function (err, txs, ntip) {
    if (err) return next(err)
    ntip.relevantAddr = addr.toString()
    next(null, txs, ntip)
  })
}

Blockchain.getUtxosByAddr = function (addr, next) {
  var spenderAddr = addr.toString()
  var query = {
    spenderAddr: spenderAddr
  }
  async.waterfall([ function (next) {
    UtxoCache.find(query, 'blockHeight', next)
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
        var index = txo.index
        var spent = !(txid in utxos) ||
          !utxos[txid].filter(function (utxo) {
            return utxo.index === txo.index
          }).length
        if (!spent) {
          var cutxo = {
            txId: txid,
            spenderAddr: spenderAddr,
            index: index,
            script: txo.script.toBuffer(),
            satoshis: txo.satoshis,
            isTesting: addr.network.name === 'testnet',
            blockId: txo.tx.block.hash,
            blockHeight: txo.tx.block.height
          }
          return UtxoCache.create(cutxo, function (err) {
            if (err) return next(err)
            UtxoCache.one({
              txId: cutxo.txId,
              spenderAddr: cutxo.spenderAddr,
              index: cutxo.index
            }, function (err, cutxo) {
              if (err) return next(err)
              cutxos.push(cutxo)
              next(null)
            })
          })
        }
        next(null)
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
  var opCount
  var pubKeys
  for (var txid in txids) {
    tx = txids[txid]
    txoArr = tx.outputs.map(function (txo, n) {
      txo.index = n
      txo.tx = tx
      return txo
    }).filter(function (txo) {
      var script = txo.script
      scptAddr = script.toAddress(addr.network)
      if (scptAddr) {
        return scptAddr.toString() === addrStr
      }
      if (script.isMultisigOut() && script.chunks[0].opcodenum === 81) {
        opCount = script.getSignatureOperationsCount()
        pubKeys = script.chunks.slice(1, 1 + opCount)
        return pubKeys.map(function (pubKey) {
          return PublicKey.fromBuffer(pubKey.buf).toAddress(addr.network)
        }).filter(function (pubKeyAddr) {
          return pubKeyAddr.toString() === addrStr
        }).length
      }
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
