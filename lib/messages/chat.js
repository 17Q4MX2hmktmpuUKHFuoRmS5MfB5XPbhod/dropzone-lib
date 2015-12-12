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
    contents: optionalBuffer.concat([ function (cb) {
      if ((this.sessionPrivKey) && (!this.value)) {
        this.raise('%s cannot be empty unless sessionPrivKey is empty', this.field)
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
