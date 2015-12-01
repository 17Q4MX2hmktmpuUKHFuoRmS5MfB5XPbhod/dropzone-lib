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
  fromTx: function(tx) {
    // NOTE: I'm not entirely happy with this implementation, but it should work
    // for now.
    switch(tx.data.slice(0,6).toString()){
      case 'INPAID':
        new payment.Payment(tx)
        break;
      case 'INCRTE':
        new invoice.Invoice(tx)
        break;
      // TODO: Support others
    }

    return null
  }
}
