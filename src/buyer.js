var messageBase = require('../src/message_base')

var Buyer = messageBase.MessageBase.extend({
  $attrString: {d: 'description', a: 'alias'},
  $attrPkey: {t: 'transferPkey'},
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
      if (buyer.senderAddr && (!buyer.transferPkey) && (buyer.receiverAddr != buyer.senderAddr) )
        onError('does not match senderAddr', 'receiverAddr', buyer.receiverAddr)
    })
    .withCustom(function (buyer, onError) {
      if ( (buyer.transferPkey) && (buyer.transferPkey != buyer.receiverAddr) )
        onError('does not match receiverAddr', 'transferPkey', buyer.transferPkey)
    })
    .withCustom(function (buyer, onError) {
      if (buyer.transferPkey && buyer.transferPkey != 0 && 
        (!that.connection.isValidAddr(buyer.transferPkey) ) )
        onError('must be a valid address', 'transferPkey', buyer.transferPkey)
    })
    .withOptional('transferPkey', validator.isString() )
  }
})

module.exports = {
  Buyer: Buyer
}
