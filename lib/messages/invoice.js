var extend = require('shallow-extend')
var inherits = require('inherits')
var messages = require('./message')

var MessageBase = messages.MessageBase

var Invoice = function Invoice (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Invoice, MessageBase)
extend(Invoice, MessageBase)

extend(Invoice.prototype, {
  type: 'INCRTE',
  attrInt: {p: 'amountDue', e: 'expirationIn'},
  schemaFields: {
    txid: {type: 'string'},
    tip: {type: 'integer', min: 0},
    messageType: {type: 'string', required: true, pattern: /^INCRTE$/},
    receiverAddr: [
      // TODO: Maybe this should be a standard function
      {type: 'string', required: true},
      function (cb) {
        if (this.source.senderAddr && this.value &&
          (this.source.senderAddr === this.value)) {
          this.raise('%s matches senderAddr', this.field)
        }
        cb()
      }
    ],
    amountDue: {type: 'integer', min: 0},
    expirationIn: {type: 'integer', min: 0}
  }
})

Invoice.prototype.getPayments = function (next) {
  this.connection.messagesByAddr(this.senderAddr, {type: 'INPAID',
    startBlock: this.blockHeight}, function (err, payments) {
      if (err) throw err
      // TODO check for the sender recipient as well: .find_all{|p| p.invoice_txid == txid }
      next(null, payments)
    })
}

module.exports = {
  Invoice: Invoice
}
