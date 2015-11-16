var _ = require('lodash')
var bitcore = require('bitcore-lib')
var validator = require('node-validator')
var util = require('util')

var $ = bitcore.util.preconditions

var Varint = bitcore.encoding.Varint
var BufferReader = bitcore.encoding.BufferReader

var DEFAULT_FEE = 40000

function toVarString(buf) {
  return new Buffer.concat([new Varint(buf.length).buf, new Buffer(buf)])
}

function MessageBase (connection, options) {
  $.checkArgument(connection, 
    'First argument is required, please include a connection.')

  var messageAttribs = {}
  var messageIntegers = []
  var messageAddrs = []
  var typesInclude = []

  this.__defineGetter__('connection', function(){
    return connection
  })

  this.__defineGetter__('messageAttribs', function(){
    return messageAttribs
  })

  this.__defineGetter__('messageType', function(){
    return typesInclude[0]
  })

  this.isAttrInt = function(key){
    $.checkArgument(key, 'First argument is required, please include a key.')
    return _.contains(messageIntegers, key)
  }

  this.isAttrAddr = function(key){
    $.checkArgument(key, 'First argument is required, please include a key.')
    return _.contains(messageAddrs, key)
  }

  // Load up our attributes for quick reference:
  _.extend(messageAttribs, this.$attrString, this.$attrInt, this.$attrAddr)

  if (this.$attrInt)
    messageIntegers = messageIntegers.concat(_.keys(attrs))

  if (this.$attrAddr)
    messageAddrs = messageAddrs.concat(_.keys(this.$attrAddr))

  if (this.$type)
    typesInclude.push(this.$type)

  // Set our attributes from either a serialized store, or explicit parameters:
  if (options) {
    if (options['data']) {
      var data = options['data']
      delete options['data']
      _.merge(options, this.dataFromBin(data))
    }

    _.forEach(options, function(val, key) {
      this.__defineGetter__(key, function(){
        return val
      })
    }, this)
  }
}

MessageBase.prototype.toTransaction = function () {
  return {receiverAddr: this.receiverAddr, data: this.dataToBin(), 
    tip: DEFAULT_FEE }
}

MessageBase.prototype.toHash = function () {
  var baseAttrs = ['receiverAddr', 'senderAddr', 'txid', 'tip', 'messageType']

  return _.reduce(_.values(this.messageAttribs).concat(baseAttrs), 
    function(memo, attr) {
    if (this[attr])
      memo[attr] = this[attr]

    return memo
  }, {}, this)
}

MessageBase.prototype.dataToBin = function () {
  var dataAttribs =  _.reduce(this.messageAttribs, function(memo, full, abbrev) {
    memo[abbrev] = this[full]
    return memo
  }, {}, this)

  var payload = _.compact(_.map(dataAttribs, function(value, key) {
    if (_.isUndefined(value) || _.isNull(value) ) {
      return null
    }

    var encodedValue = null
    
    if (this.isAttrInt(key)) {
      encodedValue = new Varint(parseInt(value)).buf
    }
    else if (this.isAttrAddr(key)) {
      encodedValue = toVarString(this.connection.hash160FromAddr(String(value)))
    } else {
      encodedValue = toVarString(String(value))
    }

    return Buffer.concat([toVarString(String(key)), encodedValue])
  }, this ))

  return Buffer.concat( [new Buffer(this.messageType)].concat( payload ) )
}

MessageBase.prototype.dataFromBin = function (data) {
  var ret = {}

  var dataType = data.slice(0, 6).toString()
  var pairs = data.slice(6, data.length)

  if ( (this.messageType != dataType) || (pairs.length == 0) )
    return {}

  br = BufferReader(pairs)
  
  while (!br.eof()) {
    var shortKey = br.read(br.readVarintBN().toNumber()).toString()

    var value = (this.isAttrInt(shortKey)) ?
      br.readVarintBN().toNumber() :
      br.read(br.readVarintBN().toNumber()).toString()

      if (this.isAttrAddr(shortKey) && value) {
        value = this.connection.hash160ToAddr(bitcore.Networks.mainnet)
      /* TODO
        value = (value == 0.chr) ? 0 : 
          anynet_for_address(:hash160_to_address, value.unpack('H*')[0])
      */
      }

    var longKey = this.messageAttribs[shortKey]

    if (longKey)
      ret[longKey] = value
  }

  return ret
}

MessageBase.prototype.isValid = function (cb) {
  
  if (this.$validator)
    validator.run( this.$validator(validator.isObject(), validator), 
      this.toHash(), cb)
  else
    cb(0, [])
}

MessageBase.prototype.save = function (privateKey, cb) {
  var that = this
  this.connection.save(this.toTransaction(), privateKey, function(err, record) {
    if (err)
      cb(err)
    else
      cb(null, new that.$constructor( that.connection, record ) )
  })
}

MessageBase.find = function (connection, txid, cb) {
  $.checkArgument(connection, 
    'First argument is required, please include a connection.')

  $.checkArgument(txid, 
    'Second argument is required, please include a transaction id.')

  var that = this

  connection.txById(txid, function(err, tx) {
    if (err)
      cb(err)
    else
      cb(null, (tx) ? new that(connection, tx) : null)
  })
}

// Borrowed from: 
// https://github.com/bfanger/angular-activerecord/blob/master/src/angular-activerecord.js
MessageBase.extend = function(protoProps, staticProps) {
  var parent = this
  var child

  if (protoProps && typeof protoProps.$constructor === 'function') {
    child = protoProps.$constructor
  } else {
    child = function () { return parent.apply(this, arguments) }
  }
  _.assign(child, parent, staticProps)
  var Surrogate = function () { this.$constructor = child }
  Surrogate.prototype = parent.prototype
  child.prototype = new Surrogate()
  if (protoProps) {
    _.assign(child.prototype, protoProps)
  }
  child.__super__ = parent.prototype
  return child
}


module.exports = {
  MessageBase: MessageBase
}
