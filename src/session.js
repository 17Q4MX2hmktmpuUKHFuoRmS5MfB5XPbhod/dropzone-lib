var util = require('util')
var crypto = require('crypto')
var asn = require('asn1.js')
var async = require('async')
var storage = require('./storage')
var messages = require('./messages')
var cache = require('./cache')

var BN = asn.bignum
var Messages = messages.Messages
var ChatMessage = messages.ChatMessage
var CommKeyStore = storage.models.CommKey
var ChatStore = storage.models.Chat
var TxCache = cache.models.Tx

util.inherits(SessionError, Error)

var DHDER = asn.define('DH', function () {
  this.seq().obj(this.key('p').int(), this.key('g').int())
})

function SessionError (message) {
  this.name = this.constructor.name
  this.message = 'Session error: ' + message
  Error.captureStackTrace(this, this.constructor)
}

function MissingReceiverError () {
  SessionError.call(this, 'missing receiver')
}

function NotAuthenticatedError () {
  SessionError.call(this, 'the conversation is not yet authenticated')
}

function SessionIdNotFoundError () {
  SessionError.call(this, 'session id not found')
}

function Session (privKey, sessionSecret, options) {
  this.privKey = privKey
  this.sessionKey = new Buffer(sessionSecret, 'hex')

  if (options.receiverAddr) {
    this.receiverAddr = options.receiverAddr
    this.network = options.receiverAddr.network
    this.senderAddr = this.getSenderAddr()
  } else if (options.init) {
    this.network = options.init.senderAddr.network
    this.senderAddr = this.privKey.toAddress(this.network)
    this.receiverAddr = options.init.receiverAddr
    if (this.senderAddr.toString() === this.receiverAddr.toString()) {
      this.receiverAddr = options.init.senderAddr
    }
    this.init = options.init
    this.txId = this.init.txId
  } else {
    throw new MissingReceiverError()
  }

  if (options.auth) {
    this.auth = options.auth
  }

  this.messages = []
  if (options.messages) {
    this.messages = options.messages
  }
}

Session.prototype.getUnreadMessages = function (next) {
  var session = this
  ChatStore.one({
    sessionTxId: session.txId
  }, 'id', function (err, chat) {
    if (err) return next(err)
    var readMessages = 0
    if (chat) {
      readMessages = chat.readMessages
    }
    var messagesLen = session.messages.length
    if (readMessages > messagesLen) {
      readMessages = messagesLen
    }
    session.unreadMessages = messagesLen - readMessages
    next(null, session)
  })
}

Session.prototype.setUnreadMessages = function (next) {
  next = next || function () {}
  var session = this
  ChatStore.one({
    sessionTxId: session.txId
  }, 'id', function (err, chat) {
    if (err) return next(err)
    var unreadMessages = session.unreadMessages
    if (unreadMessages < 0) {
      unreadMessages = 0
    }
    var messagesLen = session.messages.length
    chat.readMessages = messagesLen - unreadMessages
    chat.save(next)
  })
}

Session.prototype.isAuthenticated = function () {
  return this.init && this.auth
}

Session.prototype.getSenderAddr = function () {
  return this.privKey.toAddress(this.network)
}

Session.prototype.genSymmKey = function () {
  var der = DHDER.decode(new Buffer(this.init.der), 'der')
  var p = der.p.toString(16)
  var g = parseInt(der.g.toString(10), 10)
  var dh = crypto.createDiffieHellman(p, 'hex', g)
  dh.setPrivateKey(this.sessionKey)
  dh.generateKeys()
  if (this.auth) {
    var theirSessionKey = this.getTheirs().sessionPrivKey
    this.symmKey = dh.computeSecret(theirSessionKey)
    return this.symmKey
  } else {
    throw new NotAuthenticatedError()
  }
}

Session.prototype.getTheirs = function () {
  if (this.init.senderAddr === this.receiverAddr.toString() &&
    this.init.receiverAddr === this.senderAddr.toString()) {
    return this.init
  }
  return this.auth
}

Session.prototype.authenticate = function (der, next) {
  if (arguments.length === 1) {
    next = der
    der = null
  }

  var p
  var g
  var dh

  var isInit = !this.init || this.auth

  if (isInit) {
    if (der) {
      p = der.p.toString(16)
      g = parseInt(der.g.toString(10), 10)
      dh = crypto.createDiffieHellman(p, 'hex', g)
    } else {
      dh = crypto.createDiffieHellman(1024)
    }
  } else {
    p = this.init.der.p.toString(16)
    g = parseInt(der.g.toString(10), 10)
    dh = crypto.createDiffieHellman(p, 'hex', g)
  }

  dh.setPrivateKey(this.sessionKey)
  dh.generateKeys()

  der = DHDER.encode({
    p: new BN(dh.getPrime('hex'), 16),
    g: new BN(dh.getGenerator('hex'), 16)
  }, 'der')

  var message = new ChatMessage({
    receiverAddr: this.receiverAddr,
    senderAddr: this.senderAddr,
    sessionPrivKey: dh.getPublicKey(),
    der: isInit ? der : ''
  })

  message.send(this.privKey, function (err, tx) {
    if (err) return next(err)
    this.txId = tx.id
    this.auth = message
    this.messages = []
    this.unreadMessages = 0
    ChatStore.create({
      sessionTxId: this.txId,
      readMessages: 0
    }, function (err) {
      next(err)
    })
  }.bind(this))
}

Session.prototype.sendMessage = function (message, next) {
  message.receiverAddr = this.receiverAddr
  message.senderAddr = this.senderAddr

  message.send(this.privKey, function (err, tx) {
    if (err) return next(err)
    message.txId = tx.id
    this.messages.push(message)
    ChatStore.one({
      sessionTxId: this.txId
    }, function (err, chat) {
      if (err) return next(err)
      chat.readMessages += 1
      chat.save(function (err) {
        next(err, tx.id)
      })
    })
  }.bind(this))
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
  async.waterfall([ function (next) {
    Session.secretFor(addr, receiverAddr, next)
  }, function (key, next) {
    var auth = messages.filter(function (message) {
      return message.isAuth &&
      (receiverAddr.toString() !== message.receiverAddr.toString() || !message.isInit)
    }).shift()
    messages = messages.filter(function (message) {
      return !message.isInit && (
      (message.senderAddr.toString() === init.senderAddr.toString() &&
      message.receiverAddr.toString() === init.receiverAddr.toString()) ||
      (message.receiverAddr.toString() === init.senderAddr.toString() &&
      message.senderAddr.toString() === init.receiverAddr.toString()))
    })
    var session = new Session(privKey, key.secret, {
      init: init,
      auth: auth,
      messages: messages.filter(function (message) {
        return !auth || message.txId !== auth.txId
      })
    })
    session.getUnreadMessages(next)
  }], next)
}

Session.all = function (privKey, network, next) {
  var addr = privKey.toAddress(network.test)
  var addrStr = addr.toString()
  Messages.find({
    or: [{ receiverAddr: addrStr }, { senderAddr: addrStr }]
  }, addr, network, function (err, messages) {
    if (err) return next(err)
    var opts = {
      privKey: privKey,
      addr: addr
    }
    async.map(messages.filter(function (message) {
      return message.isInit
    }).filter(function (a, x, c) {
      return !c.filter(function (b, y) {
        return ((a.senderAddr.toString() === b.senderAddr.toString() &&
        a.receiverAddr.toString() === b.receiverAddr.toString()) ||
        (a.senderAddr.toString() === b.receiverAddr.toString() &&
        a.receiverAddr.toString() === b.senderAddr.toString())) &&
        x > y
      }).length
    }), function (init, next) {
      Session.fromMessages([init].concat(messages), opts, next)
    }, next)
  })
}

Session.one = function (privKey, network, sessionTxId, next) {
  var addr = privKey.toAddress(network.test)
  var addrStr = addr.toString()
  TxCache.one({ txId: sessionTxId }, function (err, tx) {
    if (err || !tx) return new SessionIdNotFoundError()
    var otherAddr = tx.receiverAddr === addrStr
      ? tx.senderAddr
      : tx.receiverAddr
    Messages.find({
      or: [
        { receiverAddr: addrStr, senderAddr: otherAddr },
        { senderAddr: addrStr, receiverAddr: otherAddr }
      ]
    }, addr, network, function (err, messages) {
      if (err) return next(err)
      var opts = {
        privKey: privKey,
        addr: addr
      }
      Session.fromMessages(messages.filter(function (message) {
        return message.isInit && message.txId === sessionTxId
      }).concat(messages), opts, next)
    })
  })
}

module.exports = {
  Session: Session,
  MissingReceiverError: MissingReceiverError,
  NotAuthenticatedError: NotAuthenticatedError,
  SessionIdNotFoundError: SessionIdNotFoundError
}
