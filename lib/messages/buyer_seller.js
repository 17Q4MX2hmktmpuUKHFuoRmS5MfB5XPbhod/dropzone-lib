/**
 * @file Contains the Buyer and Seller messages
 * @module messages
 */

var extend = require('shallow-extend')
var inherits = require('inherits')
var messages = require('./message')
var bitcore = require('bitcore-lib')

var testnet = bitcore.Networks.testnet
var MessageBase = messages.MessageBase

var buyerSellerAttribs = {
  attrString: {d: 'description', a: 'alias'},
  attrAddrImmutable: {t: 'transferAddr'}
}

var buyerSellerSchemaFields = {
  txid: {type: 'string'},
  tip: {type: 'integer', min: 0},
  receiverAddr: [
    {type: 'string', required: true},
    function (cb) {
      if (this.source.senderAddr && (!this.source.transferAddr) &&
        (this.value !== this.source.senderAddr)) {
        this.raise('%s does not match senderAddr', this.field)
      }
      cb()
    }
  ],
  description: {type: 'string'},
  alias: {type: 'string'},
  transferAddr: [
    function (cb) {
      if (this.value && (typeof this.value !== 'string') && (this.value !== 0)) {
        this.raise('%s is not a string', this.field)
      }
      cb()
    },
    function (cb) {
      if ((this.value) && (this.value !== this.source.receiverAddr)) {
        this.raise('%s does not match receiverAddr', this.field)
      }
      cb()
    },
    function (cb) {
      if (this.value && (this.value !== 0) &&
        (!this.source.connection.isValidAddr(this.value))) {
        this.raise('%s must be a valid address', this.field)
      }
      cb()
    }
  ]
}

/**
 * A DZBYUPDT Buyer message. From the Whitepaper:
 * > Buyer Declarations are optional for buyers, but are available for buyers
 * > to declare some form of identity metadata. These can be declared at any
 * > time, and in the case that multiple buyer declarations exist on the same
 * > public key, the most recent declaration will serve as the relevant declaration.
 *
 * **receiverAddr**: Buyer messages should be addressed to the same address it
 * is being sent from, unless the transferAddr property is specfied (in which
 * the receiverAddr should match the transferAddr)
 *
 * **NOTE**: All attributes that are specified below are also getter properties
 *  that can be accessed on this instantiated object.
 *
 * @class Buyer
 * @param {Driver} connection - blockchain connection
 * @param {object} attrs - Attributes that this Invoice contains
 * @param {String} attrs.alias - This is the alias of the buyer, meant to
 *  identify the seller in a non-unique and colloquial fashion (i.e., "Satoshi").
 * @param {String} attrs.description - This is the description of the buyer,
 *  and can contain text and/or URLs.
 * @param {String} attrs.transferAddr - This is enabled for identity transfer,
 *  and not intended for use at the time of the addresses first declaration.
 *  This value specifies the new address of the buyer, to which all existing
 *  earned reputation will transfer. All messages after this attribute is
 *  declared are no longer valid from this address.
 */
function Buyer (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Buyer, MessageBase)
extend(Buyer, MessageBase)

extend(Buyer.prototype, {
  type: 'BYUPDT',
  schemaFields: extend({ messageType:
    {type: 'string', required: true, pattern: /^BYUPDT$/} },
    buyerSellerSchemaFields)}, buyerSellerAttribs)

/**
 * A DZSLUPDT Seller message. From the Whitepaper:
 * > Seller declarations are required to prefix all item listings, and declare 
 * > the sender's address as "open for business." However, a seller 
 * > declaration can occur multiple times after the declaration of an item
 * > creation for the purpose of overriding earlier declarations. In the case
 * > that multiple seller declarations exist on the same public key, the 
 * > attributes of the most recent declaration will serve as the relevant
 * > declaration.
 *
 * **receiverAddr**: Seller messages should be addressed to the same address it
 * is being sent from, unless the transferAddr property is specfied (in which
 * the receiverAddr should match the transferAddr)
 *
 * **NOTE**: All attributes that are specified below are also getter properties
 *  that can be accessed on this instantiated object.
 *
 * @class Seller
 * @param {Driver} connection - blockchain connection
 * @param {object} attrs - Attributes that this Invoice contains
 * @param {String} attrs.alias - This is the alias of the buyer, meant to
 *  identify the seller in a non-unique and colloquial fashion (i.e., "Satoshi").
 * @param {String} attrs.description - This is the description of the buyer,
 *  and can contain text and/or URLs.
 * @param {String} attrs.transferAddr - This is enabled for identity transfer,
 *  and not intended for use at the time of the addresses first declaration.
 *  This value specifies the new address of the buyer, to which all existing
 *  earned reputation will transfer. All messages after this attribute is
 *  declared are no longer valid from this address.
 * @param {String} attrs.communicationsAddr - TODO
 */
function Seller (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
}

inherits(Seller, MessageBase)
extend(Seller, MessageBase)

extend(Seller.prototype, {
  attrAddrMutable: {p: 'communicationsAddr'},
  type: 'SLUPDT',
  schemaFields: extend({ messageType:
    {type: 'string', required: true, pattern: /^SLUPDT$/},
    communicationsAddr: [
      {type: 'string'},
      function (cb) {
        if (this.value && (this.value !== 0) &&
          (!this.source.connection.isValidAddr(this.value, testnet))) {
          this.raise('%s must be a valid address', this.field)
        }
        cb()
      }]
    }, buyerSellerSchemaFields)}, buyerSellerAttribs)

module.exports = {
  Buyer: Buyer,
  Seller: Seller
}
