var message = require('./message')
var buyerSeller = require('./buyer_seller')
var invoice = require('./invoice')
var payment = require('./payment')

module.exports = {
  Message: message.MessageBase,
  Buyer: buyerSeller.Buyer,
  Seller: buyerSeller.Seller,
  Invoice: invoice.Invoice,
  Payment: payment.Payment,
  fromTx: function (connection, tx) {
    // NOTE: I'm not entirely happy with this implementation, but it should work
    // for now.

    switch (tx.data.slice(0, 6).toString()) {
      case 'INPAID':
        return new payment.Payment(connection, tx)
      case 'INCRTE':
        return new invoice.Invoice(connection, tx)
      // TODO: Support others
    }

    return null
  }
}
