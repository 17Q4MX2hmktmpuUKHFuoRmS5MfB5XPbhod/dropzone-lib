/**
 * @file Contains the Chat message
 * @module messages
 */

var crypto = require('crypto')
var extend = require('shallow-extend')
var inherits = require('inherits')
var messages = require('./message')

var MessageBase = messages.MessageBase

var CIPHER_ALGORITHM = 'aes-256-cbc'

inherits(NoSymmKeyError, Error)

function NoSymmKeyError (message) {
  this.name = this.constructor.name
  this.message = 'Symmetric Key not present, and required'
  if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
}

/**
 * A DZCOMMUN message. This message contains all persistence logic related to the
 * communications between parties in Drop Zone. Unlike all other messages,
 * It would be expected that these communications would only occur over testnet.
 * Be sure to provide the correct testnet-mode driver to this message's
 * constructor.
 *
 * There's some esoteric rules about what attributes are valid and when, so
 * unless there's a good reason to be in here, it's probable that the Session
 * object should be performing all management of these messages in your code.
 *
 * **receiverAddr**: Chats should be addressed to the person with whom you
 * wish to communicate
 *
 * **NOTE**: All attributes that are specified below are also getter properties
 *  that can be accessed on this instantiated object.
 *
 * @class Chat
 * @extends module:messages~MessageBase
 * @param {Driver} connection - blockchain connection
 * @param {object} attrs - Attributes that this Chat contains
 * @param {Buffer} attrs.iv - An initialization vector for the contents
 * @param {Buffer} attrs.contents - The encrypted contents of a message that's
 *  been sent.
 * @param {Buffer} attrs.der - A Diffie Helmann der to be supplied by a session
 *  initiator.
 * @param {Buffer} attrs.sessionPrivKey - A Diffie Hellman public key, to be
 *  supplied by a recipient of an iniation request, for the purpose of
 *  symmetric key exchange.
 */
var Chat = function Chat (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
  this.symmKey = null
}

inherits(Chat, MessageBase)
extend(Chat, MessageBase)

var optionalBuffer = [
  {type: 'object'},
  function (cb) {
    if (this.value && !Buffer.isBuffer(this.value)) {
      this.raise('%s is not a buffer', this.field)
    }
    cb()
  }
]

extend(Chat.prototype, {
  type: 'COMMUN',
  attrBinary: {i: 'iv', c: 'contents', d: 'der', p: 'sessionPrivKey'},
  schemaFields: {
    txid: {type: 'string'},
    tip: {type: 'integer', min: 0},
    messageType: {type: 'string', required: true, pattern: /^COMMUN$/},
    der: optionalBuffer,
    sessionPrivKey: optionalBuffer.concat([ function (cb) {
      if ((this.der) && (!this.value)) {
        this.raise('%s cannot be empty unless der is empty', this.field)
      }
      cb()
    }]),
    iv: optionalBuffer.concat([ function (cb) {
      if ((this.contents) && (!this.value)) {
        this.raise('%s cannot be empty unless contents is empty', this.field)
      }
      cb()
    }])
  }
})

/**
 * Is this message a session initiation request?
 *
 * @function
 * @return {Boolean}
 */
Chat.prototype.isInit = function () {
  return !!(this.der && this.sessionPrivKey)
}

/**
 * Is this message an authentication response to a session initiation request?
 *
 * @function
 * @return {Boolean}
 */
Chat.prototype.isAuth = function () { return !!this.sessionPrivKey }

/**
 * Return the decrypted contents of this message.
 *
 * NOTE: Not all Chat messages have content. Additionally, the symmKey property
 * of this Chat must be set (typically by the Session object) in order for this
 * method to work.
 *
 * @function
 * @return {String}
 */
Chat.prototype.contentsPlain = function () {
  if (!this.symmKey) throw new NoSymmKeyError()

  var key = this.symmKey.slice(0, 32)
  var decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, this.iv)
  return Buffer.concat([ decipher.update(this.contents),
    decipher.final()]).toString('utf-8')
}

/**
 * Is this message addressed to the specified receiverAddr, from the specified
 * senderAddr
 *
 * @function
 * @param {String} senderAddr
 * @param {String} receiverAddr
 * @return {Boolean}
 */
Chat.prototype.isAddressedTo = function (senderAddr, receiverAddr) {
  return (
    (this.senderAddr === senderAddr) && (this.receiverAddr === receiverAddr))
}

module.exports = {Chat: Chat}
