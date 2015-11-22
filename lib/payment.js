var messageBase = require('./message_base')

module.exports = {
  Payment: messageBase.MessageBase.extend({
    $type: 'INPAID',
    $attrString: {d: 'description', t: 'invoiceTxid'},
    $attrInt: {q: 'deliveryQuality',  p: 'productQuality', 
      c: 'communicationsQuality'},
    $validator:function(v, validator) { 
      var that = this

      return v.withOptional('senderAddr', validator.isString())
        .withOptional('txid', validator.isString())
        .withOptional('tip', validator.isInteger())
        .withRequired('messageType', validator.isString({ regex: /^INPAID$/ }) )
        .withRequired('receiverAddr', validator.isString() )
    }
  })
}
