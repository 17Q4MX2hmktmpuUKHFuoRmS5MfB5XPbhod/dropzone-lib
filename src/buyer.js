var messageBase = require('../src/message_base')

var Buyer = messageBase.MessageBase.extend({
  $attrString: {d: 'description', a: 'alias'},
  $attrAddr: {t: 'transferAddr'},
  $type: 'BYUPDT',
  $validator: function(v, validator) { 
    var that = this

    return v.withOptional('senderAddr', validator.isString())
    .withOptional('txid', validator.isString())
    .withOptional('tip', validator.isInteger())
    .withRequired('receiverAddr', validator.isString() )
    .withRequired('messageType', validator.isString({ regex: /^BYUPDT$/ }) )
    .withOptional('description', validator.isString() )
    .withOptional('alias', validator.isString() )
    .withCustom(function (buyer, onError) {
      if (buyer.senderAddr && (!buyer.transferAddr) && 
        (buyer.receiverAddr != buyer.senderAddr) )
        onError('does not match senderAddr', 'receiverAddr', buyer.receiverAddr)
    })
    .withCustom(function (buyer, onError) {
      if ( (buyer.transferAddr) && (buyer.transferAddr != buyer.receiverAddr) )
        onError('does not match receiverAddr', 'transferAddr', buyer.transferAddr)
    })
    .withCustom(function (buyer, onError) {
      if (buyer.transferAddr && buyer.transferAddr != 0 && 
        (!that.connection.isValidAddr(buyer.transferAddr) ) )
        onError('must be a valid address', 'transferAddr', buyer.transferAddr)
    })
    .withOptional('transferAddr', validator.isString() )
  }
})

module.exports = {
  Buyer: Buyer
}
