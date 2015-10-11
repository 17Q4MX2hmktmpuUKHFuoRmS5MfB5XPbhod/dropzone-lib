var bitcore = require('bitcore')
var p2p = require('bitcore-p2p')

var PublicKey = bitcore.PublicKey
var BloomFilter = p2p.BloomFilter

BloomFilter.prototype.insertAddress = function (address) {
  this._addresses = this._addresses || []
  this._addresses.push(address.toString())
  this.insert(address)
}

BloomFilter.prototype.isRelevantAddress = function (address) {
  return this._addresses.indexOf(address) > -1
}

module.exports = {
  BloomFilter: BloomFilter
}
