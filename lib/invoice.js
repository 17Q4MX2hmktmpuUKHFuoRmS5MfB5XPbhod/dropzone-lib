var messageBase = require('./message_base')

/* TODO
    def payments
      blockchain.messages_by_addr(sender_addr, type: 'INPAID', 
        start_block: block_height).find_all{|p| p.invoice_txid == txid }
    end
*/

module.exports = {
  Invoice: messageBase.MessageBase.extend({
    $type: 'INCRTE',
    $attrInt: {p: 'amountDue', e: 'expirationIn'},
    $validator:function(v, validator) { 
      var that = this

      return v.withOptional('senderAddr', validator.isString())
        .withOptional('txid', validator.isString())
        .withOptional('tip', validator.isInteger())
        .withRequired('messageType', validator.isString({ regex: /^INCRTE$/ }) )
        .withRequired('receiverAddr', validator.isString() )
        .withOptional('amountDue', validator.isInteger({ min: 0 }))
        .withOptional('expirationIn', validator.isInteger({ min: 0 }))
        .withCustom(function (invoice, onError) {
          if (invoice.senderAddr && invoice.receiverAddr && 
            (invoice.senderAddr == invoice.receiverAddr ) )
            onError('matches senderAddr', 'receiverAddr', invoice.receiverAddr)
        })
    }
  })
}
