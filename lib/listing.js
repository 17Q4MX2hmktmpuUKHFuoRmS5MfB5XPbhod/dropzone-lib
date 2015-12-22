var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')
var messages = require('./messages')
var profile = require('../lib/profile')

var Item = messages.Item
var SellerProfile = profile.SellerProfile

var $ = bitcore.util.preconditions

var Listing = function Listing (connection, txid) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')
  $.checkArgument(txid,
    'Second argument is required, please include txid.')

  this.__defineGetter__('connection', function () { return connection })
  this.__defineGetter__('txid', function () { return txid })

  this.messageTypes ='ITUPDT'

  this.stateAttribs = ['description', 'priceCurrency', 'priceInUnits',
    'expirationIn']
}

// This was copied out of profile. It's not terribly DRY, but should work:
Listing.prototype._attrsFrom = function (keys, attrs) {
  return [{}].concat(keys).reduce(function (acc, attr) {
    if ((typeof attrs[attr] !== 'undefined') && (attrs[attr] !== null)) {
      acc[attr] = attrs[attr]
    }
    return acc
  })
}

Listing.prototype.getAttributes = function (cb) {
  var attributes = {txid: this.txid}

  Item.find(this.connection, this.txid, function (err, createItem) {
    if (err) return cb(err)

    if (!createItem || createItem.messageType !== 'ITCRTE') {
      return cb(null, null)
    }

    createItem.isValid(function (err, res) {
      if (err) return cb(err)
      if (res) return cb(null, null)

      extend(attributes, 
        this._attrsFrom(this.stateAttribs, createItem))

      // TODO : It'd be nice we supported a sinceHeight
      this.connection.messagesByAddr(createItem.senderAddr, 
        {type: this.messageTypes, startBlock: createItem.blockHeight}, 
        function (err, addrMessages) {
          if (err) return cb(err)

          for (var i=addrMessages.length-1; i>=0; i--) {
            if (addrMessages[i].createTxid == this.txid) {
              extend(attributes, 
                this._attrsFrom(this.stateAttribs, addrMessages[i]))
            }
          }

          // We're good on this item
          attributes.createItem = createItem
          attributes.addr = createItem.senderAddr
          attributes.latitude = createItem.latitude
          attributes.longitude = createItem.longitude
          attributes.radius = createItem.radius
          attributes.sellerProfile = new SellerProfile(this.connection,
            createItem.senderAddr)
          attributes.expirationAt = createItem.blockHeight + 
            attributes.expirationIn
          attributes.addr = createItem.senderAddr
          // TODO:
          attributes.validation = null

          cb(null, attributes)
        }.bind(this))
    }.bind(this))
  }.bind(this))
}

module.exports = {
  Listing: Listing
}
