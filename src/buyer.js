var _ = require('lodash')
var util = require('util')
var messageBase = require('../src/message_base')

var MessageBase = messageBase.MessageBase

var Buyer = MessageBase.extend({
  $initialize: function(model) {
    model._pushAttrMessage({d: 'description', a: 'alias'})
    model._pushAttrMessagePkey({t: 'transfer_pkey'})

    model._setMessageType('BYUPDT')
  }
})

module.exports = {
  Buyer: Buyer
}
