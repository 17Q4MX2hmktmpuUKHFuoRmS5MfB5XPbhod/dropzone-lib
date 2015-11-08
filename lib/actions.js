var bitcore = require('bitcore')
var session = require('./session')
var messages = require('./messages')

var Networks = bitcore.Networks
var Session = session.Session
var ChatMessage = messages.ChatMessage

var NeedAuthenticationError = session.NeedAuthenticationError
var AlreadyAuthenticatedError = session.AlreadyAuthenticatedError
var NotAuthenticatedError = session.NotAuthenticatedError

var getAllSessions = function (privKey, opts, next) {
  var addr = privKey.toAddress(Networks[opts.network])
  Session.all(privKey, Networks[opts.network], function (err, sessions) {
    if (err) return next(err)
    next(null, sessions.filter(function (a, x, c) {
      return !c.filter(function (b, y) {
        return a.txId === b.txId && x > y
      }).length
    }), addr)
  })
}

var getAllChatMessages = function (privKey, txId, opts, next) {
  var addr = privKey.toAddress(Networks[opts.network])
  Session.one(privKey, Networks[opts.network], txId, function (err, session) {
    if (err) return next(err)
    var symmKey = session.genSymmKey()
    next(null, session.messages, session, symmKey, addr)
  })
}

var createSession = function (privKey, receiverAddr, opts, next) {
  var addr = privKey.toAddress(Networks[opts.network])
  Session.secretFor(addr, receiverAddr, function (err, key) {
    if (err) return next(err)
    var session = new Session(privKey, key.secret, {
      receiverAddr: receiverAddr
    })
    session.authenticate(function (err) {
      if (err) return next(err)
      next(null, session, addr)
    })
  })
}

var acceptSession = function (privKey, txId, opts, next) {
  var addr = privKey.toAddress(Networks[opts.network])
  Session.one(privKey, Networks[opts.network], txId, function (err, session) {
    if (err) return next(err)
    if (session.isAuthenticated()) {
      return next(new AlreadyAuthenticatedError())
    } else if (session.init.senderAddr.toString() === addr.toString()) {
      return next(new NeedAuthenticationError())
    } else {
      return session.authenticate(function (err) {
        if (err) return next(err)
        next(null, session, addr)
      })
    }
  })
}

var sendChatMessage = function (privKey, txId, text, opts, next) {
  var addr = privKey.toAddress(Networks[opts.network])
  Session.one(privKey, Networks[opts.network], txId, function (err, session) {
    if (err) return next(err)
    if (!session.isAuthenticated()) {
      return next(new NotAuthenticatedError())
    }
    var message = new ChatMessage({ contents: text })
    var symmKey = session.genSymmKey()
    message.encrypt(symmKey)
    session.sendMessage(message, function (err, txId) {
      if (err) return next(err)
      next(null, session.messages.slice(-1), session, symmKey, addr)
    })
  })
}

module.exports = {
  getAllSessions: getAllSessions,
  getAllChatMessages: getAllChatMessages,
  acceptSession: acceptSession,
  sendChatMessage: sendChatMessage,
  createSession: createSession
}
