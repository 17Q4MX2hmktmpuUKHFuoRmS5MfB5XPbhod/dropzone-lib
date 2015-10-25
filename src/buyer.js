var _ = require('lodash')
var util = require('util')
var messageBase = require('../src/message_base')

var MessageBase = messageBase.MessageBase

var Buyer = MessageBase.extend({
  // TODO: Remove this
  $initialize: function(model) {
    model._pushAttrMessage({d: 'description', a: 'alias'})
    model._pushAttrMessagePkey({t: 'transferPkey'})

    model._setMessageType('BYUPDT')
  },
  // TODO use this
  $attrString: {d: 'description', a: 'alias'},
  $attrPkey: {t: 'transferPkey'},
  $type: 'BYUPDT'
})

module.exports = {
  Buyer: Buyer
}
