var _ = require('lodash')
var bitcore = require('bitcore-lib')
var Schema = require('async-validate')
var merge = require('merge')
var extend = require('shallow-extend')

var $ = bitcore.util.preconditions

var Varint = bitcore.encoding.Varint
var BufferReader = bitcore.encoding.BufferReader

var DEFAULT_FEE = 40000

Schema.plugin([
  require('async-validate/plugin/object'),
  require('async-validate/plugin/string'),
  require('async-validate/plugin/integer'),
  require('async-validate/plugin/util')
])

function toVarString (buf) {
  return Buffer.concat([new Varint(buf.length).buf, new Buffer(buf)])
}

function MessageBase (connection, options) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')

  var messageAttribs = {}
  var messageIntegers = []
  var messageAddrs = []
  var typesInclude = []
  var messageAddrMutable = []

  // TODO: Move the basic fields here
  var schema = new Schema({type: 'object', fields: this.schemaFields})

  this.__defineGetter__('schema', function () {
    return schema
  })

  this.__defineGetter__('connection', function () {
    return connection
  })

  this.__defineGetter__('messageAttribs', function () {
    return messageAttribs
  })

  this.__defineGetter__('messageType', function () {
    return typesInclude[0]
  })

  this.isAttrInt = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageIntegers.indexOf(key) >= 0)
  }

  this.isAttrAddr = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageAddrs.indexOf(key) >= 0)
  }

  this.attrAddrType = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageAddrMutable.indexOf(key) >= 0) ? bitcore.Networks.testnet
      : bitcore.Networks.mainnet
  }

  // Load up our attributes for quick reference:
  extend(messageAttribs, this.attrString, this.attrInt,
    this.attrAddrMutable, this.attrAddrImmutable)

  if (this.attrInt) {
    messageIntegers = messageIntegers.concat(Object.keys(this.attrInt))
  }

  if (this.attrAddrMutable) {
    var mKeys = Object.keys(this.attrAddrMutable)
    messageAddrs = messageAddrs.concat(mKeys)
    messageAddrMutable = messageAddrMutable.concat(mKeys)
  }

  if (this.attrAddrImmutable) {
    messageAddrs = messageAddrs.concat(Object.keys(this.attrAddrImmutable))
  }

  if (this.type) {
    typesInclude.push(this.type)
  }

  // Set our attributes from either a serialized store, or explicit parameters:
  if (options) {
    if (options['data']) {
      var data = options['data']
      delete options['data']
      merge(options, this.dataFromBin(data))
    }
  
    _.forEach(options, function (val, key) {
      this.__defineGetter__(key, function () {
        return val
      })
    }, this)
/* TODO: This should work better no...
    for (var key in options) {
      var value = options[key]
      this.__defineGetter__(key, function () { return value })
    }
  */
  }
}

MessageBase.prototype.toTransaction = function () {
  return {receiverAddr: this.receiverAddr, data: this.dataToBin(),
    tip: DEFAULT_FEE }
}

MessageBase.prototype.toHash = function () {
  var attrs = this.messageAttribs.map(function(k){this.messageAttribs[k]})
  attrs.concat(['receiverAddr', 'senderAddr', 'txid', 'tip', 'messageType'])

  return [{}].concat(attrs).reduce(function (memo, attr) {
    if (this[attr]) { memo[attr] = this[attr] }
    return memo
  })
}

MessageBase.prototype.dataToBin = function () {
  var dataAttribs = _.reduce(this.messageAttribs, function (memo, full, abbrev) {
    memo[abbrev] = this[full]
    return memo
  }, {}, this)

  // TODO: This should just be a Buffer object
  var payload = []
  for (var key in dataAttribs) {
    var value = dataAttribs[key]
    if (_.isUndefined(value) || _.isNull(value)) {
      continue
    }

    var encodedValue = null

    if (this.isAttrInt(key)) {
      encodedValue = new Varint(parseInt(value, 10)).buf
    } else if (this.isAttrAddr(key)) {
      encodedValue = toVarString(this.connection.hash160FromAddr(String(value)))
    } else {
      encodedValue = toVarString(String(value))
    }

    // TODO: this is convoluted
    payload.push(Buffer.concat([toVarString(String(key)), encodedValue]))
  }

  // TODO: Just return payload
  return Buffer.concat([new Buffer(this.messageType)].concat(payload))
}

MessageBase.prototype.dataFromBin = function (data) {
  var ret = {}

  var dataType = data.slice(0, 6).toString()
  var pairs = data.slice(6, data.length)

  if ((this.messageType !== dataType) || (pairs.length === 0)) {
    return {}
  }

  var br = BufferReader(pairs)

  while (!br.eof()) {
    var shortKey = br.read(br.readVarintBN().toNumber()).toString()

    var value = null

    if (this.isAttrInt(shortKey)) {
      value = br.readVarintBN().toNumber()
    } else if (this.isAttrAddr(shortKey)) {
      var length = br.readVarintBN().toNumber()
      value = br.read(length)

      value = ((value.length === 1) && value[0] === 0) ? 0
        : this.connection.hash160ToAddr(new Buffer(value),
          this.attrAddrType(shortKey))
    } else {
      value = br.read(br.readVarintBN().toNumber()).toString()
    }

    var longKey = this.messageAttribs[shortKey]

    if (longKey) {
      ret[longKey] = value
    }
  }

  return ret
}

MessageBase.prototype.isValid = function (cb) {
  this.schema.validate(this, cb)
}

MessageBase.prototype.save = function (privateKey, cb) {
  var that = this
  this.connection.save(this.toTransaction(), privateKey, function (err, record) {
    cb.apply(this,
      (err) ? [err] : [null, new that.constructor(that.connection, record)])
  })
}

MessageBase.find = function (connection, txid, cb) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')

  $.checkArgument(txid,
    'Second argument is required, please include a transaction id.')

  var That = this

  connection.txById(txid, function (err, tx) {
    cb.apply(this,
      (err) ? [err] : [null, (tx) ? new That(connection, tx) : null])
  })
}

module.exports = {
  MessageBase: MessageBase
}
