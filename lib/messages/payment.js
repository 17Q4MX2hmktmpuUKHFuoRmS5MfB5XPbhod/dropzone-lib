var extend = require('shallow-extend')
var inherits = require('inherits')
var message = require('./message')
var invoice = require('./invoice')

var Invoice = invoice.Invoice
var MessageBase = message.MessageBase

var Payment = function Payment (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Payment, MessageBase)
extend(Payment, MessageBase)

extend(Payment.prototype, {
  type: 'INPAID',
  attrString: {d: 'description', t: 'invoiceTxid'},
  attrInt: {q: 'deliveryQuality',  p: 'productQuality', 
    c: 'communicationsQuality'},
  getInvoice: function (next) {
    // TODO: Maybe we should cache this request?
    Invoice.find(this.connection, this.invoiceTxid, next)
  },
  schemaFields: {
    txid: {type: 'string'},
    tip: {type: 'integer', min: 0},
    messageType: {type: 'string', required: true, pattern: /^INPAID$/},
    receiverAddr: [
      {type: 'string', required: true},
      // TODO: Maybe this should be a standard function
      function (cb) {
        if (this.source.senderAddr && this.value && 
          (this.source.senderAddr == this.value ) )
          this.raise('%s matches senderAddr', this.field)
        cb()
      }
    ],
    invoiceTxid: [
      {type: 'string'},
      function (cb) {
        that = this
        this.source.getInvoice(function (err, invoice) {
          if (err) throw err

          if ( (!invoice) || (invoice.senderAddr != that.source.receiverAddr) ) {
            that.raise('%s can\'t be found', that.field)
            cb()
          }

          invoice.isValid(function (err, res) {
            if (err) throw err
            if (res) that.raise('%s can\'t be found', that.field)
            cb()
          })
        })
      }
    ],
    description: {type: 'string'},
    deliveryQuality: {type: 'integer', min: 0, max: 8},
    productQuality: {type: 'integer', min: 0, max: 8},
    communicationsQuality: {type: 'integer', min: 0, max: 8}
  }
})

module.exports = {
  Payment: Payment
}
