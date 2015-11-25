var messageBase = require('./message_base')
var invoice = require('../lib/invoice')

var Invoice = invoice.Invoice

module.exports = {
  Payment: messageBase.MessageBase.extend({
    $type: 'INPAID',
    $attrString: {d: 'description', t: 'invoiceTxid'},
    $attrInt: {q: 'deliveryQuality',  p: 'productQuality', 
      c: 'communicationsQuality'},
    getInvoice: function(next) {
      Invoice.find(this.connection, this.invoiceTxid, next)
    },
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
        .withCustom(function (payment, onError) {
          if (payment.senderAddr && payment.receiverAddr && 
            (payment.senderAddr == payment.receiverAddr ) )
            onError('matches senderAddr', 'receiverAddr', payment.receiverAddr)
        })
        .withCustom(function (payment, onError) {
          // TODO: This doesnt' work at all because async...
          payment.getInvoice( function(err, invoice) {
            if (err) throw err
            
            if ( (!invoice) || (invoice.senderAddr != payment.receiverAddr) )
              onError("can't be found", 'invoice', undefined)

            invoice.isValid(function(count, errors) {
              if (count != 0)
                onError("can't be found", 'invoice', undefined)
            })
          })
       })
    }
  })
}
