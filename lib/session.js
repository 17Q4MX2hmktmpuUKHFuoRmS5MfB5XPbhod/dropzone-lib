var crypto = require('crypto')
var inherits = require('inherits')
var asn = require('asn1.js')
var async = require('async')
var storage = require('./storage')
var messages = require('./messages')
var cache = require('./cache')

var BN = asn.bignum
var ChatMessage = messages.ChatMessage
var CommKeyStore = storage.models.CommKey
var ChatStore = storage.models.Chat
var TxCache = cache.models.Tx

inherits(SessionError, Error)

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

function AlreadyAuthenticatedError () {
  SessionError.call(this, 'the conversation it is already authenticated')
}

function NeedAuthenticationError () {
  SessionError.call(this,
    'the conversation needs to be authenticated by the receiver')
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
  var session = this
  next = next || function () {}
  ChatStore.one({
    sessionTxId: session.txId
  }, 'id', function (err, chat) {
    if (err) return next(err)
    var messagesLen = session.messages.length
    var unreadMessages = session.unreadMessages
    if (unreadMessages < 0) {
      unreadMessages = 0
    }
    if (!chat) {
      return ChatStore.create({
        sessionTxId: session.txId,
        readMessages: messagesLen - unreadMessages
      }, next)
    }
    chat.readMessages = messagesLen - unreadMessages
    chat.save(next)
  })
}

Session.prototype.isAuthenticated = function () {
  return !!this.getOurAuth()
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
    var theirSessionKey = this.getTheirAuth().sessionPrivKey
    this.symmKey = dh.computeSecret(theirSessionKey)
    return this.symmKey
  } else {
    throw new NotAuthenticatedError()
  }
}

Session.prototype.getOurAuth = function () {
  var init = this.init
  if (init.senderAddr.toString() === this.senderAddr.toString() &&
    init.receiverAddr.toString() === this.receiverAddr.toString()) {
    return init
  }
  return this.auth
}

Session.prototype.getTheirAuth = function () {
  var init = this.init
  if (init.senderAddr.toString() === this.receiverAddr.toString() &&
    init.receiverAddr.toString() === this.senderAddr.toString()) {
    return init
  }
  return this.auth
}

Session.prototype.authenticate = function (der, next) {
  if (arguments.length === 1) {
    next = der
    der = null
  } else if (!arguments.length) {
    next = function () {}
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
    der = DHDER.decode(new Buffer(this.init.der), 'der')
    p = der.p.toString(16)
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
    if (!this.init) {
      this.txId = tx.id
      this.init = message
      return ChatStore.create({
        sessionTxId: this.txId,
        readMessages: 0
      }, function (err) {
        next(err)
      })
    } else if (!this.isAuthenticated()) {
      this.auth = message
      this.auth.txId = tx.id
      next(err)
    }
  }.bind(this))
}

Session.prototype.sendMessage = function (message, next) {
  next = next || function () {}
  message.receiverAddr = this.receiverAddr
  message.senderAddr = this.senderAddr

  message.send(this.privKey, function (err, tx) {
    if (err) return next(err)
    var symmKey = this.genSymmKey()
    message.txId = tx.id
    message.decrypt(symmKey)
    this.messages.push(message)
    ChatStore.one({
      sessionTxId: this.txId
    }, function (err, chat) {
      if (err) return next(err)
      if (chat) {
        chat.readMessages += 1
        chat.save(function (err) {
          next(err, message)
        })
      } else {
        ChatStore.create({
          sessionTxId: this.txId,
          readMessages: 1
        }, function (err, message) {
          next(err, message)
        })
      }
    })
  }.bind(this))
}

Session.prototype.decryptMessages = function () {
  try {
    var symmKey = this.genSymmKey()
    this.messages = this.messages.map(function (message) {
      message.decrypt(symmKey)
      return message
    })
  } catch (err) {}
}

Session.prototype.watch = function (next) {
  var addr = this.getSenderAddr()
  var symmKey = this.genSymmKey()
  messages.watch(addr, function (err, message) {
    if (err) return next(err)
    var local = message.senderAddr.toString() === addr.toString()
    message.origin = local ? 'local' : 'remote'
    message.decrypt(symmKey)
    next(null, message)
  })
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

Session.selectMessages = function (init, messages) {
  return messages.filter(function (m) {
    return ((m.senderAddr.toString() === init.senderAddr.toString() &&
    m.receiverAddr.toString() === init.receiverAddr.toString()) ||
    (m.senderAddr.toString() === init.receiverAddr.toString() &&
    m.receiverAddr.toString() === init.senderAddr.toString()))
  })
}

Session.uniqueInits = function (inits) {
  return inits.filter(function (a, x, c) {
    return !c.filter(function (b, y) {
      return ((a.senderAddr.toString() === b.senderAddr.toString() &&
      a.receiverAddr.toString() === b.receiverAddr.toString()) ||
      (a.senderAddr.toString() === b.receiverAddr.toString() &&
      a.receiverAddr.toString() === b.senderAddr.toString())) &&
      x > y
    }).length
  })
}

Session.fromMessages = function (messages, opts, next) {
  var privKey = opts.privKey
  var addr = opts.addr
  var init = messages.shift()
  async.waterfall([ function (next) {
    var theirAddr = init.receiverAddr
    if (init.receiverAddr.toString() === addr.toString()) {
      theirAddr = init.senderAddr
    }
    Session.secretFor(addr, theirAddr, next)
  }, function (key, next) {
    var auth = messages.filter(function (message) {
      return !message.isInit && message.isAuth
    }).shift()
    var session = new Session(privKey, key.secret, {
      init: init,
      auth: auth,
      messages: messages.filter(function (message) {
        return message.isPrintable
      })
    })
    if (session.auth) {
      session.decryptMessages()
    }
    session.getUnreadMessages(next)
  }], next)
}

Session.all = function (privKey, network, next) {
  var addr = privKey.toAddress(network.test)
  var addrStr = addr.toString()
  messages.find({
    or: [{ receiverAddr: addrStr }, { senderAddr: addrStr }]
  }, addr, network, function (err, messages) {
    if (err) return next(err)
    var opts = {
      privKey: privKey,
      addr: addr
    }
    messages = messages.map(function (message) {
      var local = message.senderAddr.toString() === addr.toString()
      message.origin = local ? 'local' : 'remote'
      message.addr = addr
      return message
    })
    var inits = messages.filter(function (message) {
      return message.isInit
    })
    async.map(Session.uniqueInits(inits), function (init, next) {
      var sessionMessages = Session.selectMessages(init, messages)
      Session.fromMessages([init].concat(sessionMessages), opts, next)
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
    messages.find({
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
      messages = messages.map(function (message) {
        var local = message.senderAddr.toString() === addr.toString()
        message.origin = local ? 'local' : 'remote'
        message.addr = addr
        return message
      })
      var init = messages.filter(function (message) {
        return message.isInit && message.txId === sessionTxId
      }).shift()
      var sessionMessages = Session.selectMessages(init, messages)
      Session.fromMessages([init].concat(sessionMessages), opts, next)
    })
  })
}

module.exports = {
  Session: Session,
  MissingReceiverError: MissingReceiverError,
  NotAuthenticatedError: NotAuthenticatedError,
  AlreadyAuthenticatedError: AlreadyAuthenticatedError,
  NeedAuthenticationError: NeedAuthenticationError,
  SessionIdNotFoundError: SessionIdNotFoundError
}
