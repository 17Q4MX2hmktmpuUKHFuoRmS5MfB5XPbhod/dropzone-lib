var async = require('async')
var network = require('./network')
var filter = require('./filter')
var cache = require('./cache')

var Network = network.Network
var BloomFilter = filter.BloomFilter
var TxCache = cache.models.Tx

var Blockchain = {}

Blockchain.getTxsByAddr = function (addr, next) {
  async.waterfall([function (next) {
    var strAddr = addr.toString()
    var queries = [{ senderAddr: strAddr }, { receiverAddr: strAddr }]
    async.concat(queries, TxCache.find, next)
  }, function (txs, next) {
    if (txs.length) return next(null, txs)
    var filter = BloomFilter.create(1, 0.1, 0, BloomFilter.BLOOM_UPDATE_ALL)
    filter.insertAddress(addr)
    new Network({ network: addr.network }).getFilteredTxs(filter, {
      hash: '00000000aac43d0734c8a9346b58ac0ce539c94853ed15cfa03a6f4d698ddaf3',
      height: 533832
    }, next)
  }], next)
}

module.exports = {
  Blockchain: Blockchain
}
