var extend = require('shallow-extend')
var inherits = require('inherits')
var async = require('async')
var crypto = require('crypto')
var asn = require('asn1.js')
var bitcore = require('bitcore-lib')

var messages = require('./messages')

var $ = bitcore.util.preconditions

var BN = asn.bignum
var Chat = messages.Chat

var DHDER = asn.define('DH', function () {
  this.seq().obj(this.key('p').int(), this.key('g').int())
})

var CIPHER_ALGORITHM = 'aes-256-cbc'

inherits(SessionError, Error)

function SessionError (message) {
  this.name = this.constructor.name
  this.message = 'Session error: ' + message
  if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
}

function InvalidWithReceiverError () {
  SessionError.call(this, 'provided chat is between incompatible parties')
}

function InvalidCommunication () {
  SessionError.call(this, 'the computed chat messages was invalid')
}

function MissingReceiverError () {
  SessionError.call(this, 'missing receiver')
}

function NotAuthenticatedError () {
  SessionError.call(this, 'the conversation is not yet authenticated')
}

function DerAlreadyExistsError () {
  SessionError.call(this,
    'the der was provided, yet already exists') }

function Session (connection, privKey, sessionSecret, options) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')
  $.checkArgument(privKey,
    'Second argument is required, please include a privkey.')
  $.checkArgument(privKey,
    'Third argument is required, please include a sessionSecret.')

  if (!options) options = {}

  this.__defineGetter__('connection', function () { return connection })
  this.__defineGetter__('privKey', function () { return privKey })
  this.__defineGetter__('sessionKey', function () { return sessionSecret })
  this.__defineGetter__('endBlock', function () { return options.endBlock })
  this.__defineGetter__('senderAddr', function () {
    return connection.privkeyToAddr(this.privKey)
  })
  this.__defineGetter__('between', function () {
    return [this.senderAddr, this.receiverAddr]
  })

  var receiverAddr

  if (options.receiverAddr) {
    // We're creating a new session:
    receiverAddr = options.receiverAddr
  } else if (options.withChat) {
    // We're attaching to the existing session:
    this.__defineGetter__('withChat', function () { return options.withChat })

    if (this.withChat.receiverAddr !== this.senderAddr) {
      throw new InvalidWithReceiverError()
    }

    receiverAddr = this.withChat.senderAddr
  } else {
    throw new MissingReceiverError()
  }

  this.__defineGetter__('receiverAddr', function () { return receiverAddr })
}

Session.prototype._getChats = function (options, cb) {
  if (!options) options = {}
  options.type = 'COMMUN'
  options.between = this.between
  if (this.endBlock) options.endBlock = this.endBlock

  this.connection.messagesByAddr(this.senderAddr, options, cb)
}

Session.prototype.getCommunicationInit = function (cb) {
  this._getChats(null, function (err, chats) {
    if (err) return cb(err)

    var initMsg
    for (var i = 0; i < chats.length; i++) {
      if (chats[i].isInit()) {
        initMsg = chats[i]
        break
      }
    }

    cb(null, initMsg)
  })
}

Session.prototype.getCommunicationAuth = function (cb) {
  this._getChats(null, function (err, chats) {
    if (err) return cb(err)

    var authMsg
    for (var i = 0; i < chats.length; i++) {
      if (chats[i].isInit()) {
        break
      } else if (chats[i].isAuth()) {
        authMsg = chats[i]
        break
      }
    }

    cb(null, authMsg)
  })
}

Session.prototype.getNegotiation = function (cb) {
  async.series([
    function (next) { this.getCommunicationInit(next) }.bind(this),
    function (next) { this.getCommunicationAuth(next) }.bind(this)],
    function (err, comms) {
      if (err) return cb(err)
      cb(null, comms[0], comms[1])
    })
}

Session.prototype.isAuthenticated = function (cb) {
  this.getNegotiation(function (err, commInit, commAuth) {
    if (err) return cb(err)
    cb(null, [commInit, commAuth].every(function (c) { return c }))
  })
}

Session.prototype.getSymmKey = function (cb) {
  this.getNegotiation(function (err, commInit, commAuth) {
    if (err) return cb(err)

    var commPrivKey

    // This returns the chat which contains 'their' sessionPrivKey
    if (commInit && commInit.isAddressedTo(this.receiverAddr, this.senderAddr)) {
      commPrivKey = commInit
    } else if (commAuth &&
      commAuth.isAddressedTo(this.receiverAddr, this.senderAddr)) {
      commPrivKey = commAuth
    }

    // If we can't compute, then it's ok to merely indicate this:
    if ((!commInit) || (!commPrivKey)) {
      return cb(new NotAuthenticatedError(), null)
    }

    var der = DHDER.decode(commInit.der, 'der')
    var p = der.p.toString(16)
    var g = parseInt(der.g.toString(10), 10)
    var dh = crypto.createDiffieHellman(p, 'hex', g)

    dh.setPrivateKey(this.sessionKey)
    dh.generateKeys()

    cb(null, dh.computeSecret(commPrivKey.sessionPrivKey))
  }.bind(this))
}

Session.prototype._chatCreate = function (attrs, cb) {
  var chat = new Chat(this.connection, extend({receiverAddr: this.receiverAddr,
    senderAddr: this.senderAddr }, attrs))

  chat.isValid(function (err, res) {
    if (err) throw err
    if (res) { return cb(new InvalidCommunication()) }
    chat.save(this.privKey, cb)
  }.bind(this))
}

// Der passing is supported only for the purpose of making tests completely
// deterministic
Session.prototype.authenticate = function (next, derEncoding) {
  this.getNegotiation(function (err, commInit, commAuth) {
    if (err) return next(err)

    var isInit = ((!commInit) || (!!commAuth && !!commInit))

    // If we're already authenticated, we'll try to re-initialize. Presumably
    // one would want to do this if they lost a secret key, or that key were
    // somehow compromised
    if (!isInit && !!derEncoding) return next(new DerAlreadyExistsError())

    if (!derEncoding && this.withChat) derEncoding = this.withChat.der

    var derDecoded
    var dh

    if (derEncoding) {
      derDecoded = DHDER.decode(new Buffer(derEncoding), 'der')
      dh = crypto.createDiffieHellman(derDecoded.p.toString(16), 'hex',
        parseInt(derDecoded.g.toString(10), 10))
    } else {
      dh = crypto.createDiffieHellman(1024)
    }

    dh.setPrivateKey(this.sessionKey)
    dh.generateKeys()

    var der = DHDER.encode({ p: new BN(dh.getPrime('hex'), 16),
      g: new BN(dh.getGenerator('hex'), 16) }, 'der')

    this._chatCreate({ sessionPrivKey: dh.getPublicKey(),
      der: (isInit) ? der : null }, next)
  }.bind(this))
}

// Iv passing is supported only for the purpose of making tests completely
// deterministic
Session.prototype.send = function (contents, cb, iv) {
  $.checkArgument(contents,
    'First argument is required, please include message contents.')

  this.isAuthenticated(function (err, isAuthenticated) {
    if (err) return cb(err)
    if (!isAuthenticated) return cb(new NotAuthenticatedError())

    this.getSymmKey(function (err, symmKey) {
      if (err) return cb(err)

      if (!iv) iv = crypto.randomBytes(16)

      var key = symmKey.slice(0, 32)
      var cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv)

      this._chatCreate({iv: iv,
        contents: Buffer.concat([cipher.update(contents), cipher.final()])}, cb)
    }.bind(this))
  }.bind(this))
}

Session.prototype.getCommunications = function (cb) {
  this.isAuthenticated(function (err, isAuthenticated) {
    if (err) return cb(err)
    if (!isAuthenticated) return cb(null, [])
  })

  async.series([
    function (next) { this.getSymmKey(next) }.bind(this),
    function (next) { this.getCommunicationInit(next) }.bind(this)],
    function (err, results) {
      if (err) return cb(err)

      var symmKey = results[0]
      var commInit = results[1]

      this._getChats({startBlock: commInit.blockHeight},
        function (err, messages) {
          if (err) return cb(err)
          cb(null, messages.filter(function (msg) { return !msg.isAuth() })
            .map(function (msg) { msg.symmKey = symmKey; return msg }))
        })
    }.bind(this))
}

Session.all = function (connection, addr, cb) {
  connection.messagesByAddr(addr, {type: 'COMMUN'}, function (err, messages) {
    if (err) return cb(err)

    cb(null, messages.filter(function (msg) { return msg.isInit() }))
  })
}

module.exports = {
  Session: Session,
  InvalidWithReceiverError: InvalidWithReceiverError,
  InvalidCommunication: InvalidCommunication,
  MissingReceiverError: MissingReceiverError,
  NotAuthenticatedError: NotAuthenticatedError,
  DerAlreadyExistsError: DerAlreadyExistsError
}
