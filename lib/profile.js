/**
 * @file Contains the Profile object, and its descendants: SellerProfile and
 *  BuyerProfile
 * @module profile
 */
var extend = require('shallow-extend')
var inherits = require('inherits')
var Schema = require('async-validate')
var bitcore = require('bitcore-lib')
var async = require('async')
var messages = require('./messages')

var $ = bitcore.util.preconditions

Schema.plugin([
  require('async-validate/plugin/array')
])

/**
 * Concatenate an Profile, and its updates, into a current representation
 * of the Profile's state.
 *
 * @class Profile
 * @param {Driver} connection - blockchain connection
 * @param {String} addr - Public address of the user
 */
function Profile (connection, addr) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')
  $.checkArgument(addr,
    'Second argument is required, please include an address.')

  /**
    Returns the connection that this profile is querying against

    @name module:profile~Profile#connection
    @type Driver
  */
  this.__defineGetter__('connection', function () { return connection })
  /**
    Returns the address that this profile represents

    @name module:profile~Profile#addr
    @type String
  */
  this.__defineGetter__('addr', function () { return addr })

  this.schemaFields = {
    messages: {type: 'array', required: true, min: 1, message: 'profile not found'},
    priorAttributes: [
      function (cb) {
        if (this.value && this.value.validations) {
          this.raise('%s invalid', this.field)
        }
        cb()
      },
      function (cb) {
        if (this.value && (this.value.transferAddr !== this.source.addr)) {
          this.raise('%s invalid transfer or closed', this.field)
        }
        cb()
      }]
  }
}

/**
 * Load items from the blockchain starting from the declaration at the beginning
 * of the user's activity, to the present. Return the accumulated state of this
 * user.
 *
 * @function
 * @param {function} cb - Callback to receive attributes as a hash in the
 *  form: function(err, attrs)
 */
Profile.prototype.getAttributes = function (cb) {
  // TODO : It'd be nice if options supported a sinceHeight
  this.connection.messagesByAddr(this.addr, {type: this.messageTypes},
    function (err, addrMessages) {
      if (err) return cb(err)

      var attributes = {addr: this.addr}
      var isCompleted = false
      var i = addrMessages.length

      async.whilst(
        function () { return ((i > 0) && (!isCompleted)) },
        function (next) {
          var profile = addrMessages[i - 1]
          var isFirstIteration = (i === (addrMessages.length))

          i -= 1

          // There is a bit of extra logic if the profile was transferred
          // from elsewhere
          if (isFirstIteration && (profile.transferAddr !== null) &&
            (typeof profile.transferAddr !== 'undefined')) {
            // Load the profile from the prior address and pop it off the stack
            new this.constructor(this.connection,
              profile.senderAddr).getAttributes(function (err, priorAttrs) {
                if (err) return next(err)

                attributes.priorAttributes = priorAttrs

                // Were there validation errors?
                // Was the prior profile deactivated or Not transferred to us?
                if ((priorAttrs.validation) ||
                  (priorAttrs.transferAddr !== attributes.addr)) {
                  isCompleted = true
                  return next()
                }

                extend(attributes,
                  messages.mergeAttributes(this.stateAttribs, priorAttrs))

                if ((typeof attributes.transferAddr !== 'undefined') &&
                  (attributes.transferAddr !== null)) {
                  isCompleted = true
                }

                return next()
              }.bind(this))
          } else {
            // This prevents a second inbound transfer from happening:
            if ((profile.transferAddr !== null) &&
              (typeof profile.transferAddr !== 'undefined')) {
              if (profile.transferAddr === this.addr) return next()

              attributes.transferAddr = profile.transferAddr
            }

            extend(attributes,
              messages.mergeAttributes(this.stateAttribs, profile))

            if ((typeof attributes.transferAddr !== 'undefined') &&
              (attributes.transferAddr !== null)) {
              isCompleted = true
            }

            return next()
          }
        }.bind(this), function (err) {
          if (err) cb(err)

          attributes.isActive = ((attributes.transferAddr === null) ||
              (typeof attributes.transferAddr === 'undefined'))
          attributes.isClosed = (attributes.transferAddr === 0)
          attributes.isFound = (addrMessages.length > 0)
          attributes.messages = addrMessages

          // Run a validation while we're here:
          new Schema({type: 'object', fields: this.schemaFields}).validate(
            attributes, function (err, res) {
              attributes.validation = res
              cb(err, attributes)
            })
        }.bind(this))
    }.bind(this))
}

/**
 * Concatenate a Seller's Profile from its seller messages, into a current
 * representation of the seller's state.
 *
 * @class SellerProfile
 * @extends Profile
 * @param {Driver} connection - blockchain connection
 * @param {String} addr - Public address of the seller
 */
function SellerProfile (connection, addr) {
  var Super = this.constructor.super_
  Super.call(this, connection, addr)
}

inherits(SellerProfile, Profile)
extend(SellerProfile, Profile)

extend(SellerProfile.prototype, { messageTypes: 'SLUPDT',
  stateAttribs: ['description', 'alias', 'communicationsAddr']})

/**
 * Concatenate a Buyer's Profile from its seller messages, into a current
 * representation of the seller's state.
 *
 * @class BuyerProfile
 * @extends Profile
 * @param {Driver} connection - blockchain connection
 * @param {String} addr - Public address of the buyer
 */
function BuyerProfile (connection, addr) {
  var Super = this.constructor.super_
  Super.call(this, connection, addr)
}

inherits(BuyerProfile, Profile)
extend(BuyerProfile, Profile)

extend(BuyerProfile.prototype, { messageTypes: 'BYUPDT',
  stateAttribs: ['description', 'alias']})

module.exports = {
  SellerProfile: SellerProfile,
  BuyerProfile: BuyerProfile
}
