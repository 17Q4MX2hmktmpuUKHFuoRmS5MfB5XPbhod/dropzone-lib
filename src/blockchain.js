var network = require('./network')
var filter = require('./filter')

var Network = network.Network
var BloomFilter = filter.BloomFilter

var Blockchain = {}

Blockchain.getTxsByAddr = function (addr, tip, next) {
  var filter = BloomFilter.create(1, 0.2, 0, BloomFilter.BLOOM_UPDATE_ALL)
  filter.insertAddress(addr)
  new Network({ network: addr.network, maxSize: 16 }).getFilteredTxs(filter, tip, next)
}

module.exports = {
  Blockchain: Blockchain
}
