var util = require('util')
var messageBase = require('../src/message_base')

var MessageBase = messageBase.MessageBase

function Buyer (connection, options) {
  Buyer.super_.call(this, connection, options)

  this.pushAttrMessage({d: 'description', a: 'alias'})
  this.pushAttrMessagePkey({t: 'transfer_pkey'})

  this.setMessageType('BYUPDT')
}

util.inherits(Buyer, MessageBase);

module.exports = {
  Buyer: Buyer
}
