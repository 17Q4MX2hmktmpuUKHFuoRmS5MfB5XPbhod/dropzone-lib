var bitcore = require('bitcore')
var p2p = require('bitcore-p2p')

var Messages = p2p.Messages
var Pool = p2p.Pool
var Peer = p2p.Peer
var Inventory = p2p.Inventory

function Network (options) {
  if (!(this instanceof Network)) {
    return new Network(options)
  }

  options = options || {}

  this.network = options.network
    ? bitcore.Networks[options.network.toString()]
    : bitcore.Networks.defaultNetwork

  this.messages = new Messages({
    network: this.network
  })

  this.pool = new Pool(options)
}

Network.prototype.getFilteredTxs = function (filter, next) {
  var tip = ({
    testnet: {
      hash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
      height: 0
    },
    livenet: {
      hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      height: 0
    }
  })[this.network.name]

  if (arguments.length > 2) {
    tip = next
    next = arguments[2]
  }

  var TXS_TIMEOUT = 200

  var txs = {}
  var currPeer

  var returnTimeout = -1
  var done = function () {
    this.pool.disconnect()
    next(null, txs)
  }.bind(this)

  this.pool.on('error', function (err) {
    if (returnTimeout > -1) {
      clearTimeout(returnTimeout)
    }
    this.disconnect()
    next(err)
  })

  this.pool.on('peererror', function (peer, err) {
    if (peer.status === Peer.STATUS.CONNECTED) {
      peer.disconnect()
    }
  })

  this.pool.on('peerready', function (peer) {
    if (!currPeer ||
    peer.bestHeight > currPeer.bestHeight ||
    currPeer.status !== Peer.STATUS.READY) {
      currPeer = peer
      var FilterLoad = this.messages.FilterLoad
      var GetHeaders = this.messages.GetHeaders
      currPeer.sendMessage(new FilterLoad(filter))
      currPeer.sendMessage(new GetHeaders({
        starts: [tip.hash],
        stops: new Array(33).join('0')
      }))
    }
  }.bind(this))

  this.pool.on('peerheaders', function (peer, message) {
    var headers = message.headers
    headers.forEach(function (header) {
      if (header.validProofOfWork()) {
        if (header.toObject().prevHash === tip.hash) {
          tip = {
            hash: header.hash,
            height: tip.height + 1
          }
        }
      }
      if (peer.host !== currPeer.host) return
      var GetData = this.messages.GetData
      var InventoryForFilteredBlock = Inventory.forFilteredBlock
      var inventory = new InventoryForFilteredBlock(header.hash)
      currPeer.sendMessage(new GetData([inventory]))
    }.bind(this))

    if (headers.length === 2000) {
      var GetHeaders = this.messages.GetHeaders
      currPeer.sendMessage(new GetHeaders({
        starts: [tip.hash],
        stops: new Array(33).join('0')
      }))
    } else {
      returnTimeout = setTimeout(done, TXS_TIMEOUT)
    }
  }.bind(this))

  this.pool.on('peertx', function (peer, message) {
    var tx = message.transaction
    if (returnTimeout > -1) {
      clearTimeout(returnTimeout)
      returnTimeout = setTimeout(done, TXS_TIMEOUT)
    }
    tx.inputs.forEach(function (input) {
      if (!input.script) return
      if (input.script.isPublicKeyHashIn() || input.script.isPublicKeyIn()) {
        var address = input.script.toAddress(this.network).toString()
        if (filter.isRelevantAddress(address) && !(tx.hash in txs)) {
          txs[tx.hash] = tx
        }
      }
    }.bind(this))
    tx.outputs.forEach(function (output) {
      if (!output.script) return
      if (output.script.isPublicKeyHashOut() || output.script.isPublicKeyOut()) {
        var address = output.script.toAddress(this.network).toString()
        if (filter.isRelevantAddress(address) && !(tx.hash in txs)) {
          txs[tx.hash] = tx
        }
      }
    }.bind(this))
  })

  this.pool.connect()
}

Network.MAIN = bitcore.Networks.livenet
Network.TEST = bitcore.Networks.testnet

module.exports = Network
