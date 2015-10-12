var async = require('async')
var bitcore = require('bitcore')
var network = require('./network')
var filter = require('./filter')
var cache = require('./cache')

var PublicKey = bitcore.PublicKey
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
  var filter = BloomFilter.forAddress(addr)
  var network = new Network({ network: addr.network })
  network.getFilteredTxs(filter, tip, function (err, txs, ntip) {
    if (err) return next(err)
    ntip.relevantAddr = addr.toString()
    next(null, txs, ntip, filter)
  })
}

Blockchain.getUtxosByAddr = function (addr, next) {
  var spenderAddr = addr.toString()
  var query = {
    spenderAddr: spenderAddr,
    isSpent: false
  }
  async.waterfall([ function (next) {
    TxoCache.find(query, next)
  }, function (ctxos, next) {
    TipCache.one({
      relevantAddr: addr.toString(),
      subject: 'txo'
    }, function (err, tip) {
      next(err, ctxos, tip)
    })
  }, function (ctxos, tip, next) {
    Blockchain.getTxsByAddr(addr, tip, function (err, txs, ntip, filter) {
      next(err, ctxos, tip, txs, ntip, filter)
    })
  }, function (ctxos, tip, txs, ntip, filter, next) {
    var txids = {}
    for (var tx, t = 0, tl = txs.length; t < tl; t++) {
      tx = txs[t]
      txids[tx.hash.toString('hex')] = tx
    }
    var txos = Blockchain.txosFromTxs(addr, txids, filter)
    var utxos = Blockchain.utxosFromTxos(addr, txids, txos, filter)
    var cutxos = ctxos.filter(function (txo) {
      return !txo.spent
    })
    next(null, txos, utxos, cutxos, tip, ntip)
  }, function (txos, utxos, cutxos, tip, ntip, next) {
    async.each(txos, function (txoArr, next) {
      async.each(txoArr, function (txo, next) {
        var txid = txo.tx.hash.toString('hex')
        var spent = !(txid in utxos) ||
          !utxos[txid].filter(function (utxo) {
            return utxo.index === txo.index
          }).length
        if (!spent) {
          var utxo = {
            txId: txid,
            spenderAddr: spenderAddr,
            index: txo.index,
            script: txo.script.toBuffer(),
            satoshis: txo.satoshis,
            isSpent: false,
            isTesting: addr.network.name === 'testnet'
          }
          return TxoCache.one({
            txId: utxo.txId,
            spenderAddr: utxo.spenderAddr,
            index: utxo.index
          }, function (err, cutxo) {
            if (err) return next(err)
            if (!cutxo) return TxoCache.create(utxo, function (err) {
              TxoCache.one({
                txId: utxo.txId,
                spenderAddr: utxo.spenderAddr,
                index: utxo.index
              }, function (err, cutxo) {
                if (err) return next(err)
                cutxos.push(cutxo)
                next(null)
              })
            })
            cutxos.push(cutxo)
            next(null)
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

Blockchain.txosFromTxs = function (addr, txids, filter) {
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
      return addrStr === txo.script.toAddress(addr.network).toString() ||
        filter.isRelevantMultisigOut(txo.script, addr.network) 
    })
    if (txoArr.length) {
      txos[txid] = txoArr
    }
  }
  return txos
}

Blockchain.utxosFromTxos = function (addr, txids, txos, filter) {
  var addrStr = addr.toString()
  var txis = {}
  var txi
  var tx
  var txid
  var ptxid
  var script
  var scptAddr
  var isRelevantIn
  for (txid in txids) {
    tx = txids[txid] 
    for (var i = 0, il = tx.inputs.length; i < il; i++) {
      txi = tx.inputs[i]
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
