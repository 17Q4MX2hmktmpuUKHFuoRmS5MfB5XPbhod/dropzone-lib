var extend = require('shallow-extend')
var async = require('async')
var bitcore = require('bitcore-lib')
var messages = require('./messages')
var profile = require('../lib/profile')
var Schema = require('async-validate')

var Item = messages.Item
var SellerProfile = profile.SellerProfile

var $ = bitcore.util.preconditions

/**
 * Concatenate an Item Declaration, and its updates, into a current representation
 * of the Item/Listing's state.
 *
 * @class Listing
 * @param {Driver} connection - blockchain connection
 * @param {txid} string - Transaction ID of an ITCRTE message
 */
function Listing (connection, txid) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')
  $.checkArgument(txid,
    'Second argument is required, please include txid.')

  this.__defineGetter__('connection', function () { return connection })
  this.__defineGetter__('txid', function () { return txid })

  this.messageTypes = 'ITUPDT'

  this.stateAttribs = ['description', 'priceCurrency', 'priceInUnits',
    'expirationIn']

  this.schemaFields = {
    createItem: {type: 'object', required: true,
    message: 'item at provided txid could not be found'},
    sellerProfile: [
      {type: 'object'},
      function (cb) {
        if (!this.value) {
          this.raise('%s invalid or missing', this.field)
          return cb()
        }

        this.value.getAttributes(function (err, attrs) {
          if (err) return cb(err)

          if (attrs.validation !== null) {
            this.raise('%s invalid or missing', this.field)
          } else if (attrs.isActive !== true) {
            this.raise('%s is inactive', this.field)
          }
          cb()
        }.bind(this))
      }]
  }
}

/*
 * functions
 */
Listing.prototype.getAttributes = function (cb) {
  var attributes = {txid: this.txid}
  var createItem

  async.series([
    function (next) {
      Item.find(this.connection, this.txid, function (err, item) {
        if (err) return next(err)

        if (!item || item.messageType !== 'ITCRTE') { return next(null, null) }
        createItem = item

        createItem.isValid(function (err, res) {
          if (err) return next(err)
          if (res) return next(null, null)

          extend(attributes,
            messages.mergeAttributes(this.stateAttribs, createItem))

          // TODO : It'd be nice we supported a sinceHeight
          this.connection.messagesByAddr(createItem.senderAddr,
            {type: this.messageTypes, startBlock: createItem.blockHeight},
            function (err, addrMessages) {
              if (err) return next(err)

              for (var i = addrMessages.length - 1; i >= 0; i--) {
                if (addrMessages[i].createTxid === this.txid) {
                  extend(attributes,
                    messages.mergeAttributes(this.stateAttribs, addrMessages[i]))
                }
              }
              next()
            }.bind(this))
        }.bind(this))
      }.bind(this))
    }.bind(this)],
    function (err) {
      if (err) return cb(err)

      // We're good on this item
      if (createItem) {
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
      }

      // Run a validation while we're here:
      new Schema({type: 'object', fields: this.schemaFields}).validate(
        attributes, function (err, res) {
          attributes.validation = res
          cb(err, attributes)
        })
    }.bind(this))
}

module.exports = {
  Listing: Listing
}
