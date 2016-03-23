/**
 * @file Contains the Payment message
 * @module messages
 */

var extend = require('shallow-extend')
var inherits = require('inherits')
var message = require('./message')
var invoice = require('./invoice')

var Invoice = invoice.Invoice
var MessageBase = message.MessageBase

/**
 * A DZINPAID Payment message. From the Whitepaper:
 * > This message provides an interface primarily for the purchaser of an item
 * > to acknowledge receipt of the good and provide feedback on the seller's
 * > delivery and product. Multiple DZINPAID messages per DZINCRTE message will
 * > be supported, but reputation ramifications will be dependent on the
 * > implementor's discretion. Buyers may need to amend a review at some time
 * > after its initial issuance. The transaction destination of this message
 * > will be addressed to the seller
 *
 * **receiverAddr**: Payments should be addressed to the sender of the
 *  Invoice which it is paying.
 *
 * **NOTE**: All attributes that are specified below are also getter properties
 *  that can be accessed on this instantiated object.
 *
 * @class Payment
 * @extends module:messages~MessageBase
 * @param {Driver} connection - blockchain connection
 * @param {object} attrs - Attributes that this Payment contains
 * @param {String} attrs.invoiceTxid - The transaction ID of the invoice that
 *  was generated
 * @param {String} attrs.description - A plaintext feedback string for detailed
 *  display on the seller's profile.
 * @param {Integer} attrs.deliveryQuality - A score representing the seller's
 *  delivery quality. This subjective metric indicates the discretion and
 *  quality of arrangement in obscuring and ease of retrieving the dead dropped
 *  product. Valid values are between 0 to 8.
 * @param {Integer} attrs.productQuality - A score representing the seller's
 *  product quality. Valid values are between 0 to 8.
 * @param {Integer} attrs.communicationsQuality - A score representing the
 *  seller's communication quality. This would be intended to measure literacy
 *  and responsiveness. Valid values are between 0 to 8.
 */
var Payment = function Payment (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Payment, MessageBase)
extend(Payment, MessageBase)

extend(Payment.prototype, {
  type: 'INPAID',
  attrString: {d: 'description'},
  attrHexString: {t: 'invoiceTxid'},
  attrInt: {q: 'deliveryQuality', p: 'productQuality',
    c: 'communicationsQuality'},
  schemaFields: {
    txid: {type: 'string'},
    tip: {type: 'integer', min: 0},
    messageType: {type: 'string', required: true, pattern: /^INPAID$/},
    receiverAddr: [
      {type: 'string', required: true},
      // TODO: Maybe this should be a standard function
      function (cb) {
        if (this.source.senderAddr && this.value &&
          (this.source.senderAddr === this.value)) {
          this.raise('%s matches senderAddr', this.field)
        }
        cb()
      }
    ],
    invoiceTxid: [
      {type: 'string'},
      function (cb) {
        var that = this
        this.source.getInvoice(function (err, invoice) {
          if (err) throw err

          if ((!invoice) || (invoice.senderAddr !== that.source.receiverAddr)) {
            that.raise('%s can\'t be found', that.field)
            return cb()
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

/**
 * Fetch the invoice that this function's invoiceTxid references from the
 * blockchain
 *
 * @function
 * @param {function} cb - Callback to receive Invoice message
 *  in the form: function(err, invoice)
 */
Payment.prototype.getInvoice = function (cb) {
  Invoice.find(this.connection, this.invoiceTxid, cb)
}

module.exports = {
  Payment: Payment
}
