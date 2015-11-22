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
        .withOptional('description', validator.isString())
        .withOptional('invoiceTxid', validator.isString())
        .withOptional('deliveryQuality', 
            validator.isInteger({ min: 0, max: 8 }))
        .withOptional('productQuality', 
            validator.isInteger({ min: 0, max: 8 }))
        .withOptional('communicationsQuality', 
            validator.isInteger({ min: 0, max: 8 }))
        .withCustom(function (invoice, onError) {
          if (invoice.senderAddr && invoice.receiverAddr && 
            (invoice.senderAddr == invoice.receiverAddr ) )
            onError('matches senderAddr', 'receiverAddr', invoice.receiverAddr)
        })
    }
  })
}
