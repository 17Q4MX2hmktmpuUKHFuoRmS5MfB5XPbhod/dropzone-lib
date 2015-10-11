var _ = require('underscore')
var bitcore = require('bitcore')

var Varint = bitcore.encoding.Varint

var DEFAULT_TIP = 20000

function toVarString(string) {
  var s = String(string)
  return new Buffer.concat([new Varint(s.length).buf, new Buffer(s)])
}

function MessageBase (connection, options) {
  _.extend(this, options || {})

  this.messageAttribs = {}
  this.messageIntegers = []
  this.messagePkeys = []
  this.typesInclude = []

  this.connection = connection
}

MessageBase.prototype.toTransaction = function () {
  return {receiver_addr: this.receiver_addr, data: this.dataToHex(), 
    tip: DEFAULT_TIP }
}

MessageBase.prototype.dataToHex = function () {
  var payload = _.compact(_.map(this.dataToHash(), function(value, key) {
    if (_.isUndefined(value) || _.isNull(value) ) {
      return null
    }

    var encodedValue = null
    
    if (this.isAttrInt(key)) {
      encodedValue = new Varint(parseInt(value)).buf
    }
    else if (this.isAttrPkey(key)) {
      /*
       * TODO: This should call the attached connection's hash160_from_address
        Bitcoin::Protocol.pack_var_string(
          (value == 0) ? 0.chr : 
            [anynet_for_address(:hash160_from_address, value)].pack('H*'))
      */
    } else {
      encodedValue = toVarString(value)
    }

    return Buffer.concat([toVarString(key), encodedValue])
  }, this ))

  return Buffer.concat( [new Buffer(this.messageType())].concat( payload ) )
}

MessageBase.prototype.dataToHash = function () {
  return _.reduce(this.messageAttribs, function(memo, full, abbrev) {
    memo[abbrev] = this[full]
    return memo
  }, {}, this)
}

MessageBase.prototype.pushAttrMessage = function(attrs){
  _.extend(this.messageAttribs, attrs)
}

MessageBase.prototype.pushAttrMessagePkey = function(attrs){
  this.messagePkeys = this.messagePkeys.concat(_.keys(attrs))
  this.pushAttrMessage(attrs)
}

MessageBase.prototype.pushAttrMessageInt = function(attrs){
  this.messageIntegers = this.messageIntegers.concat(_.keys(attrs))
  this.pushAttrMessage(attrs)
}

MessageBase.prototype.setMessageType = function(type){
  this.typesInclude.push(type)
}

MessageBase.prototype.messageType = function(){
  return this.typesInclude[0]
}

MessageBase.prototype.isAttrInt = function(key){
  return _.contains(this.messageIntegers, key)
}

MessageBase.prototype.isAttrPkey = function(key){
  return _.contains(this.messagePkeys, key)
}

module.exports = {
  MessageBase: MessageBase
}
