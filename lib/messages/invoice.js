/**
 * @file Contains the Invoice message
 * @module messages
 */

var extend = require('shallow-extend')
var inherits = require('inherits')
var messages = require('./message')

var MessageBase = messages.MessageBase

/**
 * A DZINCRTE Invoice message. From the Whitepaper:
 * > Invoices are primarily needed to establish a meaningful reputation
 * > evaluation of the seller. When a buyer purchases an item from a seller,
 * > funds must be sent to the seller following an invoice declaration. Funds
 * > received by sellers without a preceding invoice, should not add credit to
 * > the seller’s reputation. 
 * >
 * > The output address for this transaction type is addressed to the 
 * > buyer, and not to the seller, so as to aid with reputation assessment.
 *
 * **receiverAddr**: Invoices should be addressed to the public address of the
 *  buyer who will be paying for an item.
 *
 * **NOTE**: All attributes that are specified below are also getter properties
 *  that can be accessed on this instantiated object.
 *
 * @class Invoice
 * @extends module:messages~MessageBase
 * @param {Driver} connection - blockchain connection
 * @param {object} attrs - Attributes that this Invoice contains
 * @param {Integer} attrs.amountDue - The amount due, denoted in satoshis, which 
 *  does not include tipping fees.
 * @param {Integer} attrs.expirationIn - The expiration time of this invoice.
 *  "Times" are to be indicated in the number of blocks that this listing is 
 *  available for. Omitting this field indicates no expiration.
 */
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

/**
 * Retrieve all Payment messages (aka reviews) which are in response to this
 * invoice. Typically there will be one, but some ambiguity in the whitepaper
 * allows for reputation to consider subsequent reviews after the first.
 *
 * @function 
 * @param {function} cb - Callback to receive Payment messages
 *  in the form: function(err, payments) 
 */
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
