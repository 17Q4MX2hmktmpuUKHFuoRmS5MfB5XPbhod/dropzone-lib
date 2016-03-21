/**
 * @file Contains the MessageBase class from which all messages inherit
 * @module messages
 */
var bitcore = require('bitcore-lib')
var Schema = require('async-validate')
var merge = require('merge')
var extend = require('shallow-extend')

var $ = bitcore.util.preconditions

var Varint = bitcore.encoding.Varint
var BufferReader = bitcore.encoding.BufferReader

var DEFAULT_FEE = 40000
var ENCODING_VERSION_1_BLOCK = 405000

Schema.plugin([
  require('async-validate/plugin/object'),
  require('async-validate/plugin/string'),
  require('async-validate/plugin/integer'),
  require('async-validate/plugin/number'),
  require('async-validate/plugin/util')
])

function toVarString (buf) {
  return Buffer.concat([new Varint(buf.length).buf, new Buffer(buf)])
}

/**
 * A base class which contains functionality shared by all messages.
 *
 * **NOTE**: All attributes that are specified below are also getter properties
 *  that can be accessed on the inheritents of this instantiated object.
 *
 * @class MessageBase
 * @param {Driver} connection - blockchain connection
 * @param {object} attrs - Attributes that this Item contains
 * @param {String} attrs.txid - The transaction id of this message. This should
 *  be undefined on any new message being created.
 * @param {String} attrs.receiverAddr - The address of the recipient of this message
 * @param {String} attrs.senderAddr - The address of the sender of this message
 * @param {Integer} attrs.tip - The miner tip allocated for this message
 */
function MessageBase (connection, attrs) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')

  var messageAttribs = {}
  var messageIntegers = []
  var messageAddrs = []
  var messageBinary = []
  var messageHexString = []
  var typesInclude = []
  var messageAddrMutable = []

  // TODO: Move the basic fields here
  var schema = new Schema({type: 'object', fields: this.schemaFields})

  /**
    Returns the connection that this message is querying against

    @name MessageBase#connection
    @type Driver
  */
  this.__defineGetter__('connection', function () { return connection })

  /**
    Returns the 8-character ASCII 'type' code of this message.

    @name MessageBase#messageType
    @type String
  */
  this.__defineGetter__('messageType', function () { return typesInclude[0] })

  this.__defineGetter__('schema', function () { return schema })
  this.__defineGetter__('messageAttribs', function () { return messageAttribs })

  /**
    Returns what version of the dropzone encoding was/is in use on this message.
    This value is dependent on the block height. If the block height is omitted,
    it returns the 'latest' version.

    @name MessageBase#encodingVersion
    @type Integer
  */
  this.__defineGetter__('encodingVersion', function () {
    if ((this.blockHeight !== null) && (typeof this.blockHeight !== 'undefined') && 
      (this.blockHeight < ENCODING_VERSION_1_BLOCK))
      return 0
    return 1
  })


  this.isAttrInt = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageIntegers.indexOf(key) >= 0)
  }

  this.isAttrAddr = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageAddrs.indexOf(key) >= 0)
  }

  this.isAttrBinary = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageBinary.indexOf(key) >= 0)
  }

  this.isAttrHexString = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageHexString.indexOf(key) >= 0)
  }

  this.attrAddrType = function (key) {
    $.checkArgument(key, 'First argument is required, please include a key.')
    return (messageAddrMutable.indexOf(key) >= 0)
      ? this.connection.mutableNetwork : this.connection.immutableNetwork
  }

  // Load up our attributes for quick reference:
  extend(messageAttribs, this.attrString, this.attrBinary, this.attrHexString, 
    this.attrInt, this.attrAddrMutable, this.attrAddrImmutable)

  if (this.attrInt) {
    messageIntegers = messageIntegers.concat(Object.keys(this.attrInt))
  }

  if (this.attrBinary) {
    messageBinary = messageBinary.concat(Object.keys(this.attrBinary))
  }

  if (this.attrHexString) {
    messageHexString = messageHexString.concat(Object.keys(this.attrHexString))
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
  if (attrs) {
    // We set this first so that our data can decode:
    if (attrs['blockHeight']) {
      this.blockHeight = attrs['blockHeight']
      delete attrs['blockHeight']
    }

    if (attrs['data']) {
      var data = attrs['data']
      delete attrs['data']
      merge(attrs, this._dataFromBin(data))
    }

    for (var k in attrs) {
      (function (key) {
        this.__defineGetter__(key, function () { return attrs[key] })
      }).apply(this, [k])
    }
  }
}

MessageBase.prototype._dataToBin = function () {
  var payload = [new Buffer(this.messageType)]

  for (var key in this.messageAttribs) {
    var full = this.messageAttribs[key]
    var value = this[full]

    if ((value === null) || (value === undefined)) { continue }

    var encodedValue = null

    if (this.isAttrInt(key)) {
      encodedValue = new Varint(parseInt(value, 10)).buf
    } else if (this.isAttrAddr(key)) {
      encodedValue = toVarString((value === 0) ? Buffer([0])
        : this.connection.hash160FromAddr(String(value)))
    } else if (this.isAttrHexString(key)) {
      if (this.encodingVersion < 1)
        encodedValue = toVarString(value)
      else 
        encodedValue = toVarString(new Buffer(value, 'hex'))
    } else {
      encodedValue = toVarString(value)
    }

    payload.push(Buffer.concat([toVarString(key), encodedValue]))
  }

  return Buffer.concat(payload)
}

MessageBase.prototype._dataFromBin = function (data) {
  var ret = {}

  var dataType = data.slice(0, 6).toString()
  var pairs = data.slice(6, data.length)

  if ((!this._isValidMessageType(dataType)) || (pairs.length === 0)) {
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
      if (length > 0) {
        value = br.read(length)
        value = ((value.length === 1) && value[0] === 0) ? 0
          : this.connection.hash160ToAddr(new Buffer(value),
            this.attrAddrType(shortKey))
      }
    } else if (this.isAttrHexString(shortKey)) {
      value = br.read(br.readVarintBN().toNumber())

      if (this.encodingVersion < 1)
        value = value.toString()
      else
        value = value.toString('hex')
    } else {
      value = br.read(br.readVarintBN().toNumber())

      if (!this.isAttrBinary(shortKey)) { value = value.toString() }
    }

    var longKey = this.messageAttribs[shortKey]

    if (longKey && (value !== null)) {
      ret[longKey] = value
    }
  }

  return ret
}

MessageBase.prototype._isValidMessageType = function (type) {
  return (this.messageType === type)
}

/**
 * Return a hash object representing the serialized components of this transaction
 * suitable for passing onto TxEncode.
 *
 * @function
 * @return {object}
 */
MessageBase.prototype.toTransaction = function () {
  return {receiverAddr: this.receiverAddr, data: this._dataToBin(),
    tip: DEFAULT_FEE}
}

/**
 * Determine whether this message has been properly formatted, and is 'in
 * consensus' with the Drop Zone protocol. Further documentation for this
 * validation result, and it's error messages can be found in the async-validate
 * library.
 *
 * @function
 * @param {function} cb - Callback to receive the results of the validity test
 *  form: function(err, res)
 */
MessageBase.prototype.isValid = function (cb) {
  this.schema.validate(this, cb)
}

/**
 * Save this message into the blockchain, if it hasn't yet been persisted, and
 * was instantiated without a txid.
 *
 * NOTE: Validation is not performed as part of this method. It's entirely
 * possible to persist a message into the blockchain that will be ommitted from
 * search/scan results by clients. Validation is performed as part of #find()
 * not #save().
 *
 * @function
 * @param {function} cb - Callback which receives the mempool-persisted message
 *  in the form: function(err, message)
 *
 *  NOTE: Due to transaction-maleability, the persisted txid may change at the
 *  time of actual confirmation. This method merely broadcasts the message into
 *  the mempool.
 */
MessageBase.prototype.save = function (privateKey, cb) {
  var that = this
  this.connection.save(this.toTransaction(), privateKey, function (err, record) {
    cb.apply(this,
      (err) ? [err] : [null, new that.constructor(that.connection, record)])
  })
}

/**
 * Load the Drop Zone message encoded at the provided transaction id.
 *
 * @function
 * @param {Driver} connection - blockchain connection
 * @param {String} txid
 * @param {function} cb - Callback which will receive the message object
 *  in the form: function(err, message)
 *
 *  NOTE: Due to transaction-maleability, the persisted txid may change at the
 *  time of actual confirmation. This method merely broadcasts the message into
 *  the mempool.
 */
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
  MessageBase: MessageBase,
  ENCODING_VERSION_1_BLOCK: ENCODING_VERSION_1_BLOCK
}
