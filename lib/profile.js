var extend = require('shallow-extend')
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

    var attributes = {addr: this.addr}
    messages = messages.reverse()
    var i = 0

    // TODO: maybe put an isDeaded test instead of attributes.transferAddr
    async.whilst(
      function () {
        return ((i < messages.length) && (!attributes.transferAddr))
      }, function (next) {
        var seller = messages[i]
        var isFirstIteration = (i === 0)

        i += 1

        if (isFirstIteration && seller.transferAddr) {
          // There is a bit of extra logic if the seller profile was transferred
          // from elsewhere

          // Load the profile from the prior address and pop it off the stack
          var priorProfile = new SellerProfile(this.connection, seller.senderAddr)

          // It's possible the prior profile was invalid
          // TODO:
          // break unless @prior_profile.valid?
          priorProfile.isValid(function (err, res) {
            if (err) return next(err)
            if (res !== null) return next() // TODO : we need to break instead of continue

            priorProfile.getAttributes(null, function(err, priorAttrs) {
              if (err) return next(err)
              // And it's possible the prior profile was deactivated or not
              // transferred to us:
              if (priorProfile.transferAddr !== attributes.addr) {
                // TODO : we need to break instead of continue
                return next()
              }

              extend(attributes,this._attrsFrom(priorAttrs))
              next()
            })
          })

          /*

          attrs_from @prior_profile
          */
        } else {
          // This prevents a second inbound transfer from happening:
          // TODO: Is this set correctly?
          if (seller.transferAddr) {
            if (seller.transferAddr == this.addr) return next()

            attributes.transferAddr = seller.transferAddr
          }

          extend(attributes,this._attrsFrom(seller))
          next()
        }
      }.bind(this), function (err) {
        if (err) cb(err)

        attributes.isActive = (!attributes.transferAddr)

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
    acc[attr] = attrs[attr]
    return acc
  })
}

module.exports = {
  SellerProfile: SellerProfile
}
