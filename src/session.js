var util = require('util')
var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore')
var cache = require('./cache')
var messages = require('./messages')

var BN = bitcore.crypto.BN
var Messages = messages.Messages
var CommKeyCache = cache.models.CommKey
var ChatCache = cache.models.Chat

util.inherits(SessionError, Error)

function SessionError (message) {
  this.name = this.constructor.name
  this.message = 'Session error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function InvalidInitReceiver () {
  SessionError.call(this, 'invalid session init receiver address')
}

function MissingReceiver () {
  SessionError.call(this, 'missing receiver')
}

function Session (privKey, sessionSecret, options) {
  this.privKey = privKey
  this.sessionKey = new BN(sessionSecret, 16)

  options = options || {}

  if (options.receiverAddr) {
    this.receiverAddr = options.receiverAddr
  } else if (options.init) {
    var receiverAddr = options.init.receiverAddr
    if (receiverAddr === this.getSenderAddr(receiverAddr.network)) {
      throw new InvalidInitReceiver()
    }
    this.init = options.init
    this.id = this.init.txId
    this.receiverAddr = this.init.senderAddr
    this.senderAddr = this.init.receiverAddr
  } else {
    throw new MissingReceiver()
  }

  this.messages = []
  if (options.messages) {
    this.messages = options.messages
  }
}

Session.prototype.syncUnreadMessages = function (next) {
  var session = this
  ChatCache.one({
    sessionId: session.id
  }, 'id', function (err, chat) {
    if (err) return next(err)
    var readMessages = chat && chat.readMessages || 0
    session.unreadMessages = session.messages.length - readMessages
    next(null, session)
  })
}

Session.prototype.isAuthenticated = function () {
  return this.init && this.messages.filter(function (messages) {
    return messages.isAuth
  }).length
}

Session.prototype.getSenderAddr = function (network) {
  return this.privKey.toAddress(network)
}

Session.all = function (privKey, network, next) {
  var addr = privKey.toAddress(network.test)
  Messages.find({
    addr: addr
  }, network, function (err, messages) {
    if (err) return next(err)
    async.map(messages.filter(function (message) {
      return message.isInit
    }), function (init, next) {
      var receiverAddr = addr
      if (init.receiverAddr.toString() === addr.toString()) {
        receiverAddr = init.senderAddr
      }
      async.waterfall([function (next) {
        CommKeyCache.one({
          receiverAddr: receiverAddr.toString(),
          senderAddr: addr.toString()
        }, function (err, key) {
          if (err) return next(err)
          if (!key) {
            var secret = crypto.randomBytes(128).toString('hex')
            return CommKeyCache.create({
              receiverAddr: receiverAddr.toString(),
              senderAddr: addr.toString(),
              secret: secret
            }, next)
          }
          next(null, key)
        })
      }, function (key, next) {
        var opts = { init: init }
        opts.messages = messages.filter(function (message) {
          return !message.isInit && (
          (message.senderAddr.toString() === init.senderAddr.toString() &&
          message.receiverAddr.toString() === init.receiverAddr.toString()) ||
          (message.receiverAddr.toString() === init.senderAddr.toString() &&
          message.senderAddr.toString() === init.receiverAddr.toString()))
        })
        var session = new Session(privKey, key.secret, opts)
        session.syncUnreadMessages(next)
      }], next)
    }, next)
  })
}

module.exports = {
  Session: Session,
  InvalidInitReceiver: InvalidInitReceiver,
  MissingReceiver: MissingReceiver
}
