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

module.exports = {
  BloomFilter: BloomFilter
}
