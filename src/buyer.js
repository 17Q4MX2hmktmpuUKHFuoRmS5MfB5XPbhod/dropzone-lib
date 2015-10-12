var util = require('util')
var messageBase = require('../src/message_base')

var MessageBase = messageBase.MessageBase

function Buyer (connection, options) {
  Buyer.super_.call(this, connection, options)

  this._pushAttrMessage({d: 'description', a: 'alias'})
  this._pushAttrMessagePkey({t: 'transfer_pkey'})

  this._setMessageType('BYUPDT')
}

util.inherits(Buyer, MessageBase)

module.exports = {
  Buyer: Buyer
}
