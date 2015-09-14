var util = require('util')
var crypto = require('crypto')
var asn = require('asn1.js')
var async = require('async')
var storage = require('./storage')
var messages = require('./messages')

var Messages = messages.Messages
var CommKeyStore = storage.models.CommKey
var ChatStore = storage.models.Chat

util.inherits(SessionError, Error)

var DHDER = asn.define('DH', function () {
  this.seq().obj(this.key('p').int(), this.key('g').int())
})

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
  this.sessionKey = new Buffer(sessionSecret, 'hex')

  options = options || {}

  if (options.receiverAddr) {
    this.receiverAddr = options.receiverAddr
  } else if (options.init) {
    var receiverAddr = options.init.receiverAddr
    if (receiverAddr === this.getSenderAddr(receiverAddr.network)) {
      throw new InvalidInitReceiver()
    }
    this.init = options.init
    this.txId = this.init.txId
    this.receiverAddr = this.init.senderAddr
    this.senderAddr = this.init.receiverAddr
  } else {
    throw new MissingReceiver()
  }

  if (options.auth) {
    this.auth = options.auth
  }

  this.messages = []
  if (options.messages) {
    this.messages = options.messages
  }
}

Session.prototype.syncUnreadMessages = function (next) {
  var session = this
  ChatStore.one({
    sessionTxId: session.txId
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

Session.prototype.genSymmKey = function () {
  var der = DHDER.decode(new Buffer(this.init.der), 'der')
  var p = der.p.toString(16)
  var g = parseInt(der.g.toString(10), 10)
  var dh = crypto.createDiffieHellman(p, 'hex', g)
  dh.setPrivateKey(this.sessionKey)
  dh.generateKeys()
  var theirSessionKey = this.getTheirs().sessionPrivKey
  this.symmKey = dh.computeSecret(theirSessionKey)
  return this.symmKey
}

Session.prototype.getTheirs = function () {
  if (this.auth.senderAddr === this.receiverAddr.toString() &&
    this.auth.receiverAddr === this.getSenderAddr().toString()) {
    return this.init
  }
  return this.auth
}

Session.secretFor = function (addr, receiverAddr, next) {
  CommKeyStore.one({
    receiverAddr: receiverAddr.toString(),
    senderAddr: addr.toString()
  }, function (err, key) {
    if (err) return next(err)
    if (!key) {
      var secret = crypto.randomBytes(128).toString('hex')
      return CommKeyStore.create({
        receiverAddr: receiverAddr.toString(),
        senderAddr: addr.toString(),
        secret: secret
      }, next)
    }
    next(null, key)
  })
}

Session.fromMessages = function (messages, opts, next) {
  var privKey = opts.privKey
  var addr = opts.addr
  var init = messages.shift()
  var receiverAddr = init.receiverAddr
  if (init.receiverAddr.toString() === addr.toString()) {
    receiverAddr = init.senderAddr
  }
  async.waterfall([function (next) {
    Session.secretFor(addr, receiverAddr, next)
  }, function (key, next) {
    messages = messages.filter(function (message) {
      return !message.isInit && (
      (message.senderAddr.toString() === init.senderAddr.toString() &&
      message.receiverAddr.toString() === init.receiverAddr.toString()) ||
      (message.receiverAddr.toString() === init.senderAddr.toString() &&
      message.senderAddr.toString() === init.receiverAddr.toString()))
    })
    var auth = messages.filter(function (message) {
      return message.isAuth
    }).pop()
    var session = new Session(privKey, key.secret, {
      init: init,
      auth: auth,
      messages: messages.filter(function (message) {
        return !message.isAuth
      })
    })
    session.syncUnreadMessages(next)
  }], next)
}

Session.all = function (privKey, network, next) {
  var addr = privKey.toAddress(network.test)
  Messages.find({
    addr: addr
  }, network, function (err, messages) {
    if (err) return next(err)
    var opts = {
      privKey: privKey,
      addr: addr
    }
    async.map(messages.filter(function (message) {
      return message.isInit
    }), function (init, next) {
      Session.fromMessages([init].concat(messages), opts, next)
    }, next)
  })
}

Session.one = function (privKey, network, sessionTxId, next) {
  var addr = privKey.toAddress(network.test)
  Messages.find({
    addr: addr
  }, network, function (err, messages) {
    if (err) return next(err)
    var opts = {
      privKey: privKey,
      addr: addr
    }
    Session.fromMessages(messages.filter(function (message) {
      return message.isInit && message.txId === sessionTxId
    }).concat(messages), opts, next)
  })
}

module.exports = {
  Session: Session,
  InvalidInitReceiver: InvalidInitReceiver,
  MissingReceiver: MissingReceiver
}
