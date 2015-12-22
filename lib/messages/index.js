var message = require('./message')
var buyerSeller = require('./buyer_seller')
var invoice = require('./invoice')
var payment = require('./payment')
var chat = require('./chat')
var item = require('./item')

module.exports = {
  // TODO: I think we want these messages to be what's exported, instead of
  // the silly hash:
  Message: message.MessageBase,
  Buyer: buyerSeller.Buyer,
  Seller: buyerSeller.Seller,
  Invoice: invoice.Invoice,
  Payment: payment.Payment,
  Chat: chat.Chat,
  Item: item.Item,
  fromTx: function (connection, tx) {
    // NOTE: I'm not entirely happy with this implementation, but it should work
    // for now.

    // TODO: Maybe return the object and then return the call()
    switch (tx.data.slice(0, 6).toString()) {
      case 'BYUPDT':
        return new buyerSeller.Buyer(connection, tx)
      case 'SLUPDT':
        return new buyerSeller.Seller(connection, tx)
      case 'INPAID':
        return new payment.Payment(connection, tx)
      case 'INCRTE':
        return new invoice.Invoice(connection, tx)
      case 'COMMUN':
        return new chat.Chat(connection, tx)
      case 'ITCRTE':
        return new item.Item(connection, tx)
      case 'ITUPDT':
        return new item.Item(connection, tx)
    }

    return null
  },
  mergeAttributes: function (keys, attrs) {
    return [{}].concat(keys).reduce(function (acc, attr) {
      if ((typeof attrs[attr] !== 'undefined') && (attrs[attr] !== null)) {
        acc[attr] = attrs[attr]
      }
      return acc
    })
  }
}
