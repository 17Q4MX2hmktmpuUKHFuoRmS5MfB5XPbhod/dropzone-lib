var crypto = require('crypto')
var extend = require('shallow-extend')
var inherits = require('inherits')

var Message = require('./message')

var CIPHER_ALGORITHM = 'AES-256-CBC'
var CHAT_PREFIX = 'COMMUN'

var chatSchema = extend(Message.schema, {
  id: '/Chat'
})

extend(chatSchema.properties, {
  messageType: { type: 'string', pattern: '^' + CHAT_PREFIX + '$' },
  iv: { type: 'string' },
  contents: { type: 'string' },
  der: { type: 'string' },
  sessionPrivKey: { type: 'string' }
})

function Chat (params) {
  this.fromBuffer(params.data)
  Message.call(this, params)
  this.isInit = !!(this.der && this.sessionPrivKey)
  this.isAuth = !!this.sessionPrivKey
  this.isPrintable = !!(this.contents)
}

inherits(Chat, Message)
extend(Chat, Message)

Chat.prefix = CHAT_PREFIX

Chat.prototype.attributes = {
  i: 'iv',
  c: 'contents',
  d: 'der',
  p: 'sessionPrivKey'
}

Chat.prototype.validate = function (input) {
  var Super = this.constructor.super_
  Super.prototype.validate.call(this, input)
}

Chat.prototype.encrypt = function (symmKey) {
  this.iv = crypto.randomBytes(16)
  var key = symmKey.slice(0, 32)
  var cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, this.iv)
  this.contents = Buffer.concat([
    cipher.update(this.contents),
    cipher.final()
  ])
}

Chat.prototype.decrypt = function (symmKey) {
  var key = symmKey.slice(0, 32)
  var decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, this.iv)
  this.plain = Buffer.concat([
    decipher.update(this.contents),
    decipher.final()
  ]).toString('utf-8')
  return this.plain
}

module.exports = Chat
