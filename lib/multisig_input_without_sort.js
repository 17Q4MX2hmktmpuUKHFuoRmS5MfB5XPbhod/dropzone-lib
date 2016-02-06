var bitcore = require('bitcore-lib')
var inherits = require('inherits')

var $ = bitcore.util.preconditions
var Input = bitcore.Transaction.Input
var MultiSigInput = Input.MultiSig
var Script = bitcore.Script
var _ = require('lodash')

function MultiSigInputWithoutSort(input, pubkeys, threshold, signatures) {
  Input.apply(this, arguments)
  var self = this
  pubkeys = pubkeys || input.publicKeys
  threshold = threshold || input.threshold
  signatures = signatures || input.signatures
  // NOTE: This is our issue with Bitcore:
  // this.publicKeys = _.sortBy(pubkeys, function(publicKey) { return publicKey.toString('hex') })
  this.publicKeys = pubKeys
  // NOTE: We also needed to add the noSorting option:
  $.checkState(Script.buildMultisigOut(this.publicKeys, threshold,
    {noSorting: true}).equals(this.output.script),
    'Provided public keys don\'t match to the provided output script')
  this.publicKeyIndex = {}
  _.each(this.publicKeys, function(publicKey, index) {
    self.publicKeyIndex[publicKey.toString()] = index
  })
  this.threshold = threshold
  // Empty array of signatures
  this.signatures = signatures
    ? this._deserializeSignatures(signatures) 
    : new Array(this.publicKeys.length)
}
inherits(MultiSigInputWithoutSort, MultiSigInput)

module.exports = {
  MultiSigInputWithoutSort: MultiSigInputWithoutSort,
}
