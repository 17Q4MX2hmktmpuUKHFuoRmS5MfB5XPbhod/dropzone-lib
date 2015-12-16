var extend = require('shallow-extend')
var util = require('util')
var bitcore = require('bitcore-lib')
var async = require('async')

var messages = require('./messages')

var $ = bitcore.util.preconditions

function SellerProfile (connection, addr) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')
  $.checkArgument(addr,
    'Second argument is required, please include an address.')

  // TODO: This should get abstracted out, but for now it works
  var stateAttribs = ['description', 'alias', 'communicationsAddr']
  var messageTypes = 'SLUPDT'
  // /TODO

  this.__defineGetter__('messageTypes', function () { return messageTypes })
  this.__defineGetter__('stateAttribs', function () { return stateAttribs })
  this.__defineGetter__('connection', function () { return connection })
  this.__defineGetter__('addr', function () { return addr })
}

SellerProfile.prototype._getMessages = function (options, cb) {
  if (!options) options = {}
  options.type = this.messageTypes
  this.connection.messagesByAddr(this.addr, options, cb)
}

SellerProfile.prototype.getAttributes = function (options, cb) {
  // TODO : It'd be nice if options supported a sinceHeight
  this._getMessages(null, function(err, messages) {
    if (err) return cb(err)

    messages = messages.reverse()

    var attributes = {addr: this.addr}
    var isCompleted = false
    var i = 0

    async.whilst(
      function () {
        return ((i < messages.length) && (!isCompleted))
      }, function (next) {
        var seller = messages[i]
        var isFirstIteration = (i === 0)

        i += 1

        // There is a bit of extra logic if the seller profile was transferred
        // from elsewhere
        if (isFirstIteration && (seller.transferAddr !== null) &&
          (typeof seller.transferAddr !== 'undefined')) {

          // Load the profile from the prior address and pop it off the stack
          var priorProfile = new SellerProfile(this.connection, seller.senderAddr)

          priorProfile.isValid(function (err, res) {
            if (err) return next(err)
            if (res) {
              isCompleted = true
              return next()
            }

            priorProfile.getAttributes(null, function(err, priorAttrs) {
              if (err) return next(err)

              // And it's possible the prior profile was deactivated or not
              // transferred to us:
              if (priorAttrs.transferAddr !== attributes.addr) {
                isCompleted = true
                return next()
              }

              extend(attributes,this._attrsFrom(priorAttrs))

              if ( (typeof attributes.transferAddr !== 'undefined') && 
                (attributes.transferAddr !== null)) {
                isCompleted = true
              }

              return next()
            }.bind(this))
          }.bind(this))
        } else {
          // This prevents a second inbound transfer from happening:
          if ((seller.transferAddr !== null) &&
            (typeof seller.transferAddr !== 'undefined')) {
            if (seller.transferAddr === this.addr) return next()

            attributes.transferAddr = seller.transferAddr
          }

          extend(attributes,this._attrsFrom(seller))

          if ( (typeof attributes.transferAddr !== 'undefined') && 
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
        attributes.isFound = (messages.length > 0)

        cb(null, attributes)
      })
  }.bind(this))
}

SellerProfile.prototype.isValid = function (cb) {
  // TODO 
  cb(null, null)
}

SellerProfile.prototype._attrsFrom = function (attrs) {
  return [{}].concat(this.stateAttribs).reduce(function (acc, attr) {
    if ((typeof attrs[attr] !== 'undefined') && (attrs[attr] !== null)) { 
      acc[attr] = attrs[attr]
    }
    return acc
  })
}

module.exports = {
  SellerProfile: SellerProfile
}
