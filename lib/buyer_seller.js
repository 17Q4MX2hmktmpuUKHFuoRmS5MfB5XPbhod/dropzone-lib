var extend = require('shallow-extend')
var inherits = require('inherits')
var messageBase = require('./message_base')
var bitcore = require('bitcore-lib')

var testnet = bitcore.Networks.testnet
var MessageBase = messageBase.MessageBase

var validateBuyerSeller = function(v, validator) { 
  var that = this

  return v.withOptional('senderAddr', validator.isString())
  .withOptional('txid', validator.isString())
  .withOptional('tip', validator.isInteger())
  .withRequired('receiverAddr', validator.isString() )
  .withOptional('description', validator.isString() )
  .withOptional('alias', validator.isString() )
  .withCustom(function (actor, onError) {
    if (actor.senderAddr && (!actor.transferAddr) && 
      (actor.receiverAddr != actor.senderAddr) )
      onError('does not match senderAddr', 'receiverAddr', actor.receiverAddr)
  })
  .withCustom(function (actor, onError) {
    if ( (actor.transferAddr) && (actor.transferAddr != actor.receiverAddr) )
      onError('does not match receiverAddr', 'transferAddr', actor.transferAddr)
  })
  .withCustom(function (actor, onError) {
    if (actor.transferAddr && actor.transferAddr != 0 && 
      (!that.connection.isValidAddr(actor.transferAddr) ) )
      onError('must be a valid address', 'transferAddr', actor.transferAddr)
  })
  .withOptional('transferAddr', validator.isString() )
}

var buyerSellerAttribs = {
  $attrString: {d: 'description', a: 'alias'},
  $attrAddrImmutable: {t: 'transferAddr'}
}

var Buyer = function Buyer (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Buyer, MessageBase)
extend(Buyer, MessageBase)

extend(Buyer.prototype, {
  $type: 'BYUPDT',
  $validator: function(v, validator) { 
    return validateBuyerSeller.call(this, v, validator)
      .withRequired('messageType', validator.isString({ regex: /^BYUPDT$/ }) )
  }
  }, buyerSellerAttribs)

var Seller = function Seller (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Seller, MessageBase)
extend(Seller, MessageBase)

extend(Seller.prototype, {
  $attrAddrMutable: {p: 'communicationsAddr'},
  $type: 'SLUPDT',
  $validator: function(v, validator) { 
    var that = this
    return validateBuyerSeller.call(this, v, validator)
      .withRequired('messageType', validator.isString({ regex: /^SLUPDT$/ }) )
      .withOptional('communicationsAddr', validator.isString())
      .withCustom(function (actor, onError) {
        if (actor.communicationsAddr && actor.communicationsAddr != 0 && 
          (!that.connection.isValidAddr(actor.communicationsAddr, testnet) ) )
          onError('must be a valid address', 'communicationsAddr', 
            actor.communicationsAddr)
      })
  } }, buyerSellerAttribs)

module.exports = {
  Buyer: Buyer, 
  Seller: Seller
}
