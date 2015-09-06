var bitcore = require('bitcore')

var network = require('../src/network')
var filter = require('../src/filter')

var Network = network.Network
var BloomFilter = filter.BloomFilter

var net = new Network({
  network: network.test
})

var filter = BloomFilter.create(1, 0.1, 0, BloomFilter.BLOOM_UPDATE_ALL)
filter.insertAddress(bitcore.Address.fromString("mmtztEC4ZZtc78RgmGkx23vRYDe36TZWCW"))

net.getFilteredTxs(filter, { 
  hash: '00000000aac43d0734c8a9346b58ac0ce539c94853ed15cfa03a6f4d698ddaf3',
  height: 533832
}, function (err, txs) {
  console.log(Object.keys(txs).join('\n'))
})
