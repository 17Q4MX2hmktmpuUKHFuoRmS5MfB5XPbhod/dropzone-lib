var extend = require('shallow-extend')
var Schema = require('async-validate')
var bitcore = require('bitcore-lib')
var async = require('async')

var $ = bitcore.util.preconditions

// TODO : we may not need all of these
Schema.plugin([
  require('async-validate/plugin/object'),
  require('async-validate/plugin/array'),
  require('async-validate/plugin/string'),
  require('async-validate/plugin/integer'),
  require('async-validate/plugin/util')
])

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

SellerProfile.prototype._getMessages = function (options, cb) {
  if (!options) options = {}
  options.type = this.messageTypes
  this.connection.messagesByAddr(this.addr, options, cb)
}

SellerProfile.prototype.getAttributes = function (options, cb) {
  // TODO : It'd be nice if options supported a sinceHeight
  this._getMessages(null, function (err, messages) {
    if (err) return cb(err)

    var attributes = {addr: this.addr}
    var isCompleted = false
    var i = messages.length

    async.whilst(
      function () { return ((i > 0) && (!isCompleted)) },
      function (next) {
        var seller = messages[i - 1]
        var isFirstIteration = (i === (messages.length))

        i -= 1

        // There is a bit of extra logic if the seller profile was transferred
        // from elsewhere
        if (isFirstIteration && (seller.transferAddr !== null) &&
          (typeof seller.transferAddr !== 'undefined')) {
          // Load the profile from the prior address and pop it off the stack
          new SellerProfile(this.connection, seller.senderAddr).getAttributes(null,
            function (err, priorAttrs) {
              if (err) return next(err)

              attributes.priorAttributes = priorAttrs

              // Were there validation errors?
              // Was the prior profile deactivated or Not transferred to us?
              if ((priorAttrs.validation) ||
                (priorAttrs.transferAddr !== attributes.addr)) {
                isCompleted = true
                return next()
              }

              extend(attributes, this._attrsFrom(priorAttrs))

              if ((typeof attributes.transferAddr !== 'undefined') &&
                (attributes.transferAddr !== null)) {
                isCompleted = true
              }

              return next()
            }.bind(this))
        } else {
          // This prevents a second inbound transfer from happening:
          if ((seller.transferAddr !== null) &&
            (typeof seller.transferAddr !== 'undefined')) {
            if (seller.transferAddr === this.addr) return next()

            attributes.transferAddr = seller.transferAddr
          }

          extend(attributes, this._attrsFrom(seller))

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
        attributes.isFound = (messages.length > 0)
        attributes.messages = messages

        // Run a validation while we're here:
        new Schema({type: 'object', fields: this.schemaFields}).validate(
          attributes, function (err, res) {
            attributes.validation = res
            cb(err, attributes)
          })
      }.bind(this))
  }.bind(this))
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
