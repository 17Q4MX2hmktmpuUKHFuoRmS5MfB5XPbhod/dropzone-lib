var messageBase = require('../src/message_base')

var Buyer = messageBase.MessageBase.extend({
  $attrString: {d: 'description', a: 'alias'},
  $attrPkey: {t: 'transferPkey'},
  $type: 'BYUPDT'
})

module.exports = {
  Buyer: Buyer
}
