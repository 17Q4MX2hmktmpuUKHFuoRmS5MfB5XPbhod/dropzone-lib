var crypto = require('crypto')
var extend = require('shallow-extend')
var inherits = require('inherits')
var messages = require('./message')

var MessageBase = messages.MessageBase

var CIPHER_ALGORITHM = 'AES-256-CBC'

inherits(NoSymmKeyError, Error)

function NoSymmKeyError (message) {
  this.name = this.constructor.name
  this.message = 'Symmetric Key not present, and required'
  Error.captureStackTrace(this, this.constructor)
}

var Chat = function Chat (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)
  this.symmKey = null
}

inherits(Chat, MessageBase)
extend(Chat, MessageBase)

extend(Chat.prototype, {
  type: 'COMMUN',
  // TODO: Should I rename sessionPrivKey?
  attrBinary: {i: 'iv', c: 'contents', d: 'der', p: 'sessionPrivKey'},
  schemaFields: {
    txid: {type: 'string'},
    tip: {type: 'integer', min: 0},
    messageType: {type: 'string', required: true, pattern: /^COMMUN$/}
    // der: {type: 'string'}, TODO: It should be a buffer
    // sessionPrivKey: {type: 'string'}, TODO: It should be a buffer
    // contents: {type: 'string'}, TODO: It should be a buffer
    // iv: {type: 'string'}, TODO: It should be a buffer
/*
 * TODO:
    # Ders always need session_pkey:
    validates :session_pkey, not_null: true, unless: 'self.der.nil?'

    # Content always needs an iv:
    validates :iv, not_null: true, unless: 'self.contents.nil?'

    # We should always have either contents or a pkey:
    validates :contents, not_null: true, if: 'self.session_pkey.nil?'
*/
  }
})

Chat.prototype.isInit = function () {
  return !!(this.der && this.sessionPrivKey)
}

Chat.prototype.isAuth = function () { return !!this.sessionPrivKey }

Chat.prototype.contentsPlain = function () {
  if (!this.symmKey) throw new NoSymmKeyError()

  var key = this.symmKey.slice(0, 32)
  var decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, this.iv)
  return Buffer.concat([ decipher.update(this.contents),
    decipher.final()]).toString('utf-8')
}

module.exports = {Chat: Chat}
