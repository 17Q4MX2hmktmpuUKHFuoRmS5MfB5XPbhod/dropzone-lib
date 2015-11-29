var extend = require('shallow-extend')
var inherits = require('inherits')
var messageBase = require('./message_base')
var bitcore = require('bitcore-lib')

var testnet = bitcore.Networks.testnet
var MessageBase = messageBase.MessageBase

var buyerSellerAttribs = {
  attrString: {d: 'description', a: 'alias'},
  attrAddrImmutable: {t: 'transferAddr'}
}

var buyerSellerSchemaFields = {
  txid: {type: "string"},
  tip: {type: "integer", min: 0},
  receiverAddr: [
    {type: "string", required: true},
    function(cb) {
      if (this.source.senderAddr && (!this.source.transferAddr) && 
        (this.value != this.source.senderAddr) )
        this.raise('%s does not match senderAddr', this.field)
      cb()
    }
  ],
  description: {type: "string"},
  alias: {type: "string"},
  transferAddr: [
    {type: "string"},
    function(cb) {
      if ( (this.value) && (this.value != this.source.receiverAddr) )
        this.raise('%s does not match receiverAddr', this.field)
      cb()
    },
    function(cb) {
      if (this.value && (this.value != 0) && 
        (!this.source.connection.isValidAddr(this.value) ) )
        this.raise('%s must be a valid address', this.field)
      cb()
    }
  ]
}

var Buyer = function Buyer (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Buyer, MessageBase)
extend(Buyer, MessageBase)

extend(Buyer.prototype, {
  type: 'BYUPDT',
  schemaFields: extend({ messageType: 
    {type: "string", required: true, pattern: /^BYUPDT$/} }, 
    buyerSellerSchemaFields)
  }, buyerSellerAttribs)

var Seller = function Seller (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Seller, MessageBase)
extend(Seller, MessageBase)

extend(Seller.prototype, {
  attrAddrMutable: {p: 'communicationsAddr'},
  type: 'SLUPDT',
  schemaFields: extend({ messageType: 
    {type: "string", required: true, pattern: /^SLUPDT$/},
    communicationsAddr: [
      {type: "string"},
      function(cb) {
        if (this.value && (this.value != 0) && 
          (!this.source.connection.isValidAddr(this.value, testnet) ) )
          this.raise('%s must be a valid address', this.field)
        cb()
      }]
    }, buyerSellerSchemaFields)}, buyerSellerAttribs)

module.exports = {
  Buyer: Buyer, 
  Seller: Seller
}
