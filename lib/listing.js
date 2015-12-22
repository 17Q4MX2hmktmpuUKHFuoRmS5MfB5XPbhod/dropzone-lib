var bitcore = require('bitcore-lib')
var item = require('./messages/item')

var Item = item.Item

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
Listing.prototype._attrsFrom = function (attrs) {
  return [{}].concat(this.stateAttribs).reduce(function (acc, attr) {
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

      // We're good on this item
      attributes.createItem = createItem
      attributes.addr = createItem.senderAddr
      // TODO:
      attributes.validation = null

      // TODO : It'd be nice we supported a sinceHeight
      this.connection.messagesByAddr(attributes.addr, 
        {type: this.messageTypes, startBlock: createItem.blockHeight}, 
        function (err, messages) {
          if (err) return cb(err)

          for (var i=messages.length-1; i>=0; i--) {
            if (messages[i].createTxid == this.txid) {
              extend(attributes, this._attrsFrom(messages[i]))
            }
          }

          cb(null, attributes)
        }.bind(this))
    }.bind(this))
  }.bind(this))
}

module.exports = {
  Listing: Listing
}
