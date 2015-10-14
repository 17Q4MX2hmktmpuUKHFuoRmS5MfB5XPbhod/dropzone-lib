var async = require('async')
var bitcore = require('bitcore')
var p2p = require('bitcore-p2p')
var cache = require('../cache')

var Throbber = require('throbber')
var PublicKey = bitcore.PublicKey
var TxoCache = cache.models.Txo
var TipCache = cache.models.Tip

var BufferUtil = bitcore.util.buffer
var Pool = p2p.Pool
var Messages = p2p.Messages
var Inventory = p2p.Inventory

var HASH_BUFFER = 2000
var PUSH_TIMEOUT = 30000

function NetworkError (message) {
  this.name = this.constructor.name
  this.message = 'Network error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function PushTxTimeoutError () {
  NetworkError.call(this, 'transaction propagation timeout')
}

var BloomFilter = p2p.BloomFilter

BloomFilter.prototype.insertAddress = function (address) {
  this._addresses = this._addresses || []
  this._addresses.push(address.toString())
  this.insert(address)
}

BloomFilter.prototype.isRelevantAddress = function (address) {
  return this._addresses.indexOf(address) > -1
}

BloomFilter.prototype.isRelevantMultisigOut = function (script, network) {
  if (script.isMultisigOut() && script.chunks[0].opcodenum === 81) {
    var opCount = script.getSignatureOperationsCount()
    var pubKeys = script.chunks.slice(1, 1 + opCount)
    return !!pubKeys.map(function (pubKey) {
      try {
        return PublicKey.fromBuffer(pubKey.buf).toAddress(network).toString()
      } catch (err) {
        return ''
      }
    }).filter(function (pubKeyAddrStr) {
      return this._addresses.indexOf(pubKeyAddrStr) > -1
    }.bind(this)).length
  }
}

BloomFilter.forAddress = function (address) {
  var filter = BloomFilter.create(1, 0.2, 0, BloomFilter.BLOOM_UPDATE_ALL)
  filter.insertAddress(address)
  return filter
}

function Network (options) {
  if (!(this instanceof Network)) {
    return new Network(options)
  }

  options = options || {}

  if (!options.relay) {
    options.relay = true
  }

  if (!options.maxSize) {
    options.maxSize = 32
  }

  this.network = options.network
    ? bitcore.Networks[options.network.toString()]
    : bitcore.Networks.defaultNetwork

  this.messages = new Messages({
    network: this.network
  })

  this.pool = new Pool(options)
}

Network.prototype.pushTx = function (tx, next) {
  var messages = this.messages
  var pool = this.pool

  var Transaction = messages.Transaction

  var waiting = new Throbber()
  waiting.start('Waiting for transaction to propagate...')

  var done = function (err) {
    clearTimeout(timeout)
    waiting.stop()
    next(err, tx)
    pool.disconnect()
  }

  var role = 1
  var timeout = -1

  pool.on('peerready', function (peer, addr) {
    role = (role + 1) % 2
    if (role) {
      peer.sendMessage(new Transaction(tx))
    }
    if (timeout === -1) {
      timeout = setTimeout(function () {
        done(new PushTxTimeoutError())
      }, PUSH_TIMEOUT)
    }
  })

  pool.on('peerinv', function (peer, message) {
    var txid
    var item

    for (var i = message.inventory.length; i--;) {
      item = message.inventory[i]
      txid = BufferUtil.reverse(item.hash).toString('hex')
      if (item.type === 1 && txid === tx.id.toString()) {
        done()
      }
    }
  })

  pool.on('error', done)

  pool.connect()
}

Network.prototype.getFilteredTxs = function (filter, next) {
  var network = this.network
  var messages = this.messages
  var pool = this.pool

  var tip = ({
    testnet: {
      blockId: '00000000aac43d0734c8a9346b58ac0ce539c94853ed15cfa03a6f4d698ddaf3',
      blockHeight: 533832
    },
    livenet: {
      blockId: '000000000000000013341e0afa2edda3e22dcc3974b711c8c4fb3170d35bb39d',
      blockHeight: 372184
    }
  })[network.name]

  if (arguments.length > 2) {
    if (next) {
      tip = next
    }
    next = arguments[2]
  }

  var FilterLoad = messages.FilterLoad
  var GetHeaders = messages.GetHeaders
  var GetData = messages.GetData

  var InventoryForFilteredBlock = Inventory.forFilteredBlock

  var loaderPeer

  var txs = []

  var cached = {
    tx: { col: [], hashes: [] },
    block: { col: [], hashes: [] }
  }

  var storeBlock = function (block) {
    var tx
    for (var t = 0, tl = cached.tx.col.length; t < tl; t++) {
      tx = cached.tx.col[t]
      if (block.hasTransaction(tx)) {
        tx.block = {
          hash: block.header.hash,
          height: tip.blockHeight -
            (cached.block.hashes.length -
            cached.block.hashes.indexOf(block.header.hash) - 1)
        }
        txs.push(cached.tx.col.splice(t, 1)[0])
        return
      }
    }
    if (cached.block.col.length > HASH_BUFFER) {
      cached.block.col.shift()
    }
    cached.block.col.push(block)
  }

  var storeTx = function (tx) {
    var col = cached.tx.col
    var block
    var hash
    for (var b = 0, bl = cached.block.col.length; b < bl; b++) {
      block = cached.block.col[b]
      if (block.hasTransaction(tx)) {
        hash = block.header.hash
        tx.block = {
          hash: hash,
          height: tip.blockHeight -
            (cached.block.hashes.length -
            cached.block.hashes.indexOf(hash) - 1)
        }
        col = txs
        break
      }
    }
    col.push(tx)
    cached.tx.hashes.push(tx.hash)
    if (cached.tx.hashes.length > HASH_BUFFER) {
      cached.tx.hashes.shift()
    }
  }

  var scanning = new Throbber()
  scanning.start('Scanning transactions...')

  pool.on('peerready', function (peer, addr) {
    peer.hash = addr.hash
    if (!loaderPeer && peer.bestHeight >= tip.blockHeight) {
      loaderPeer = peer
      loaderPeer.sendMessage(new FilterLoad(filter))
      loaderPeer.getHeaders = function (hash) {
        this.sendMessage(new GetHeaders({
          starts: [hash],
          stops: new Array(33).join('0')
        }))
      }
      loaderPeer.getHeaders(tip.blockId)
    }
  })

  pool.on('peerheaders', function (peer, message) {
    if (loaderPeer.hash !== peer.hash) {
      return
    }
    var headers = message.headers
    if (headers.length) {
      var inventories = []

      for (var header, h = 0, l = headers.length; h < l; h++) {
        header = headers[h]
        if (!header || !header.validProofOfWork()) {
          break
        }
        header.hexPrevHash = header.toObject().prevHash
        if (header.hexPrevHash === tip.blockId) {
          inventories.push(new InventoryForFilteredBlock(tip.blockId))
          tip = {
            blockId: header.hash.toString(),
            blockHeight: tip.blockHeight + 1
          }
          cached.block.hashes.push(tip.blockId)
          if (cached.block.hashes.length > HASH_BUFFER) {
            cached.block.hashes.shift()
          }
        }
      }
      if (inventories.length) {
        loaderPeer.sendMessage(new GetData(inventories))
      }
    }
    if (headers.length && header) {
      return loaderPeer.getHeaders(tip.blockId)
    }
    pool.disconnect()
    scanning.stop()
    next(null, txs, tip)
  })

  pool.on('peermerkleblock', function (peer, message) {
    storeBlock(message.merkleBlock)
  })

  pool.on('peertx', function (peer, message) {
    var script
    var tx = message.transaction
    var address

    if (cached.tx.hashes.indexOf(tx.hash) > -1) {
      return
    }

    for (var output, o = 0, ol = tx.outputs.length; o < ol; o++) {
      output = tx.outputs[o]
      if (!output.script) {
        continue
      }
      script = output.script
      if (!script.isPublicKeyHashOut() && !script.isPublicKeyOut() && !script.isMultisigOut()) {
        continue
      }
      address = output.script.toAddress(network).toString()
      if (filter.isRelevantAddress(address) || filter.isRelevantMultisigOut(script, network)) {
        storeTx(tx)
        break
      }
    }
    for (var input, i = 0, il = tx.inputs.length; i < il; i++) {
      input = tx.inputs[i]
      if (!input.script) {
        continue
      }
      script = input.script
      if (!script.isPublicKeyHashIn() && !script.isPublicKeyIn()) {
        continue
      }
      address = input.script.toAddress(network).toString()
      if (filter.isRelevantAddress(address)) {
        storeTx(tx)
        break
      }
    }
  })

  pool.on('error', function (err) {
    pool.disconnect()
    scanning.stop()
    next(err)
  })

  pool.on('peerdisconnect', function (peer, err) {
    if (peer.getHeaders) {
      loaderPeer = null
    }
  })

  pool.connect()
}

var pushTx = function (tx, network, next) {
  next = next || function () {}
  new Network({ network: network }).pushTx(tx, next)
}

var getTxsByAddr = function (addr, tip, next) {
  var filter = BloomFilter.forAddress(addr)
  var network = new Network({ network: addr.network })
  network.getFilteredTxs(filter, tip, function (err, txs, ntip) {
    if (err) return next(err)
    getUtxosFromTxs(txs, addr, filter, function (err, cutxos) {
      if (err) return next(err)
      ntip.relevantAddr = addr.toString()
      next(null, txs, ntip, filter)
    })
  })
}

var getUtxosByAddr = function (addr, next) {
  async.waterfall([ function (next) {
    TipCache.one({
      relevantAddr: addr.toString()
    }, next)
  }, function (tip, next) {
    getTxsByAddr(addr, tip, function (err, txs, ntip, filter) {
      next(err, txs, filter)
    })
  }, function (txs, filter, next) {
    getUtxosFromTxs(txs, addr, filter, function (err, cutxos) {
      next(err, cutxos)
    })
  }], next)
}

var getUtxosFromTxs = function (txs, addr, filter, next) {
  var spenderAddr = addr.toString()
  async.waterfall([ function (next) {
    var query = {
      spenderAddr: spenderAddr,
      isSpent: false
    }
    TxoCache.find(query, function (err, ctxos) {
      next(err, ctxos, txs, filter)
    })
  }, function (ctxos, txs, filter, next) {
    var txids = {}
    for (var tx, t = 0, tl = txs.length; t < tl; t++) {
      tx = txs[t]
      txids[tx.hash.toString('hex')] = tx
    }
    var txos = txosFromTxs(addr, txids, filter)
    var utxos = utxosFromTxos(addr, txids, txos, filter)
    var cutxos = ctxos.filter(function (txo) {
      return !txo.spent
    })
    next(null, txos, utxos, cutxos)
  }, function (txos, utxos, cutxos, next) {
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
          }, function (err, cutxo) {
            if (err) return next(err)
            if (!cutxo) {
              return TxoCache.create(utxo, function (err) {
                if (err) return next(err)
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
            }
            next(null)
          })
        }
        next(null)
      }, next)
    }, function (err) {
      next(err, cutxos)
    })
  }], next)
}

var txosFromTxs = function (addr, txids, filter) {
  var addrStr = addr.toString()
  var txos = {}
  var txoArr
  var tx
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

var utxosFromTxos = function (addr, txids, txos, filter) {
  var txis = {}
  var txi
  var tx
  var txid
  var ptxid
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
  pushTx: pushTx,
  getTxsByAddr: getTxsByAddr,
  getUtxosByAddr: getUtxosByAddr,
  PushTxTimeoutError: PushTxTimeoutError
}
