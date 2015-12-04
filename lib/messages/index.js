var message = require('./message')
var buyerSeller = require('./buyer_seller')
var invoice = require('./invoice')
var payment = require('./payment')
//var chat = require('./chat')

module.exports = {
  // TODO: I think we want these messages to be what's exported, instead of 
  // the silly hash: 
  Message: message.MessageBase,
  Buyer: buyerSeller.Buyer,
  Seller: buyerSeller.Seller,
  Invoice: invoice.Invoice,
  Payment: payment.Payment,
 // Chat: chat.Chat,
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
