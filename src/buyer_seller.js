var messageBase = require('../src/message_base')
var bitcore = require('bitcore')

var testnet = bitcore.Networks.testnet

var validateBuyerSeller = function(v, validator) { 
  var that = this

  return v.withOptional('senderAddr', validator.isString())
  .withOptional('txid', validator.isString())
  .withOptional('tip', validator.isInteger())
  .withRequired('receiverAddr', validator.isString() )
  .withOptional('description', validator.isString() )
  .withOptional('alias', validator.isString() )
  .withCustom(function (actor, onError) {
    if (actor.senderAddr && (!actor.transferAddr) && 
      (actor.receiverAddr != actor.senderAddr) )
      onError('does not match senderAddr', 'receiverAddr', actor.receiverAddr)
  })
  .withCustom(function (actor, onError) {
    if ( (actor.transferAddr) && (actor.transferAddr != actor.receiverAddr) )
      onError('does not match receiverAddr', 'transferAddr', actor.transferAddr)
  })
  .withCustom(function (actor, onError) {
    if (actor.transferAddr && actor.transferAddr != 0 && 
      (!that.connection.isValidAddr(actor.transferAddr) ) )
      onError('must be a valid address', 'transferAddr', actor.transferAddr)
  })
  .withOptional('transferAddr', validator.isString() )
}

var buyerSellerStrings = {d: 'description', a: 'alias'} 

module.exports = {
  Buyer: messageBase.MessageBase.extend({
    $attrString: buyerSellerStrings,
    $attrAddr: {t: 'transferAddr'},
    $type: 'BYUPDT',
    $validator: function(v, validator) { 
      return validateBuyerSeller.call(this, v, validator)
        .withRequired('messageType', validator.isString({ regex: /^BYUPDT$/ }) )
    }
  }), 
  Seller: messageBase.MessageBase.extend({
    $attrString: buyerSellerStrings,
    $attrAddr: {t: 'transferAddr', p: 'communicationsAddr'},
    $type: 'SLUPDT',
    $validator: function(v, validator) { 
      return validateBuyerSeller.call(this, v, validator)
        .withRequired('messageType', validator.isString({ regex: /^SLUPDT$/ }) )
        .withCustom(function (actor, onError) {
          if (actor.transferAddr && actor.transferAddr != 0 && 
            (!that.connection.isValidAddr(actor.communicationsAddr, testnet) ) )
            onError('must be a valid address', 'communicationsAddr', 
              actor.communicationsAddr)
        })
    }
  })
}
