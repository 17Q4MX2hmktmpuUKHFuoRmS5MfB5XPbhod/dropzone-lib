var _ = require('lodash')
var bitcore = require('bitcore')
var $ = bitcore.util.preconditions

var Varint = bitcore.encoding.Varint

var DEFAULT_TIP = 20000

function toVarString(string) {
  var s = String(string)
  return new Buffer.concat([new Varint(s.length).buf, new Buffer(s)])
}

function MessageBase (connection, options) {
  $.checkArgument(connection, 
    'First argument is required, please include a connection.')

  _.extend(this, options || {})

  var messageAttribs = {}
  var messageIntegers = []
  var messagePkeys = []
  var typesInclude = []

  this.connection = connection

  this._pushAttrMessage = function(attrs){
    _.extend(messageAttribs, attrs)
  }

  this._pushAttrMessagePkey = function(attrs){
    messagePkeys = messagePkeys.concat(_.keys(attrs))
    this._pushAttrMessage(attrs)
  }

  this._pushAttrMessageInt = function(attrs){
    messageIntegers = messageIntegers.concat(_.keys(attrs))
    this._pushAttrMessage(attrs)
  }

  this._setMessageType = function(type){
      typesInclude.push(type)
  }

  this.messageType = function(){
      return typesInclude[0]
  }

  this.isAttrInt = function(key){
    $.checkArgument(key, 'First argument is required, please include a key.')

    return _.contains(messageIntegers, key)
  }

  this.isAttrPkey = function(key){
    $.checkArgument(key, 'First argument is required, please include a key.')

    return _.contains(messagePkeys, key)
  }

  this.dataToHash = function () {
    return _.reduce(messageAttribs, function(memo, full, abbrev) {
      memo[abbrev] = this[full]
      return memo
    }, {}, this)
  }
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
      // TODO: This is currently untested
      encodedValue = toVarString(
        new Buffer(this.connection.hash160ToAddr(String(value)),'hex'))
    } else {
      encodedValue = toVarString(value)
    }

    return Buffer.concat([toVarString(key), encodedValue])
  }, this ))

  return Buffer.concat( [new Buffer(this.messageType())].concat( payload ) )
}

MessageBase.prototype.save = function (privateKey) {
  return this.connection.save(this.toTransaction(), privateKey)
}

MessageBase.find = function (connection, txid) {
  $.checkArgument(connection, 
    'First argument is required, please include a connection.')

  var tx = connection.txById(txid)
  console.log("Hmm"+util.inspect(txid))
  console.log("Me"+util.inspect(this))
  // TODO
  // return (tx) ? this.new(tx) : nil
}

module.exports = {
  MessageBase: MessageBase
}
