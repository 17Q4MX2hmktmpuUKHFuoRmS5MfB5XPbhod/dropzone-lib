var extend = require('shallow-extend')
var inherits = require('inherits')
var messageBase = require('./message_base')
var util = require('util')

var MessageBase = messageBase.MessageBase

var Invoice = function Invoice (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Invoice, MessageBase)
extend(Invoice, MessageBase)

extend(Invoice.prototype, {
  type: 'INCRTE',
  attrInt: {p: 'amountDue', e: 'expirationIn'},

/* TODO
    def payments
      blockchain.messages_by_addr(sender_addr, type: 'INPAID', 
        start_block: block_height).find_all{|p| p.invoice_txid == txid }
    end
*/
  schemaFields: {
    txid: {type: "string"},
    tip: {type: "integer", min: 0},
    messageType: {type: "string", required: true, pattern: /^INCRTE$/},
    receiverAddr: [
      // TODO: Maybe this should be a standard function
      {type: "string", required: true},
      function(cb) {
        if (this.source.senderAddr && this.value && 
          (this.source.senderAddr == this.value ) )
          this.raise('%s matches senderAddr', this.field)
        cb()
      }
    ],
    amountDue: {type: "integer", min: 0},
    expirationIn: {type: "integer", min: 0}
  }
})

module.exports = {
  Invoice: Invoice
}
