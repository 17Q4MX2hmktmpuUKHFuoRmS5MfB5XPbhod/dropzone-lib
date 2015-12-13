var extend = require('shallow-extend')
var bitcore = require('bitcore-lib')

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

    attributes = {}

    for (var i = 0; i < messages.length; i++) {
      seller = messages[i]

      if ((i === 0) && seller.transferAddr) {
        // There is a bit of extra logic if the seller profile was transferred
        // from elsewhere

        // TODO: 
        /*
        # Load the profile from the prior address and pop it off the stack
        @prior_profile = self.class.new seller.sender_addr

        # It's possible the prior profile was invalid
        break unless @prior_profile.valid?

        # And it's possible the prior profile was deactivated or not
        # transferred to us:
        break unless @prior_profile.transfer_pkey == addr

        attrs_from @prior_profile
        */
      } else {
        // This prevents a second inbound transfer from happening:
        // TODO: Is this set correctly?
        if (seller.transferAddr) {
          if (seller.transferAddr == this.addr) continue

          attributes.transferAddr = seller.transferAddr
        }

        extend(attributes,this._attrsFrom(seller))
      }

      if (attributes.transferAddr) break
    }
    
    attributes.isActive = (!attributes.transferAddr)

    cb(null, attributes)
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
