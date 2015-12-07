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

var CIPHER_ALGORITHM = 'AES-256-CBC'

inherits(SessionError, Error)

function SessionError (message) {
  this.name = this.constructor.name
  this.message = 'Session error: ' + message
  Error.captureStackTrace(this, this.constructor)
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
  this.__defineGetter__('sessionKey', function () {
    return new Buffer(sessionSecret, 'hex')
  })
  this.__defineGetter__('senderAddr', function () {
    return connection.privkeyToAddr(this.privKey.toWIF())
  })
  this.__defineGetter__('endBlock', function () { return options.endBlock })

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

// TODO: This might be better off as a getter
Session.prototype.between = function () {
  return [this.senderAddr, this.receiverAddr]
}

Session.prototype.getMessages = function (options, cb) {
  if (!options) options = {}
  options.type = 'COMMUN'
  options.between = this.between()
  if (this.endBlock) options.endBlock = this.endBlock

  this.connection.messagesByAddr(this.senderAddr, options, cb)
}

Session.prototype.getCommunicationInit = function (cb) {
  this.getMessages(null, function (err, chats) {
    if (err) cb(err)
    var initMsg = chats.find(function (chat) { return chat.isInit() })
    cb(null, initMsg)
  })
}

Session.prototype.getCommunicationAuth = function (cb) {
  this.getMessages(null, function (err, chats) {
    if (err) cb(err)

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

Session.prototype.isAuthenticated = function (cb) {
  async.series([
    function (next) { this.getCommunicationInit(next) }.bind(this),
    function (next) { this.getCommunicationAuth(next) }.bind(this)],
    function (err, comms) {
      if (err) cb(err)
      cb(null, comms.every(function (c) { return c }))
    })
}

// This returns the chat containing 'their' symmkey
// TODO: Rename this function to theirSymmKey
Session.prototype.getTheirPrivKey = function (cb) {
  // TODO : Nix this session assignment and use this binding
  var session = this
  async.series([
    function (next) { this.getCommunicationInit(next) }.bind(this),
    function (next) { this.getCommunicationAuth(next) }.bind(this)],
    function (err, comms) {
      if (err) cb(err)

      cb(null, comms.find(function (msg) {
        return ((msg) && (msg.senderAddr === session.receiverAddr) &&
        (msg.receiverAddr === session.senderAddr))
      }))
    })
}

// TODO: We should just cache the symmKey here I think, rather then generate it
// every time.
// TODO: We should rename this getSymmKey
Session.prototype.symmKey = function (cb) {
  // TODO I think we should create a _getNegotiation(function (init, auth, their) {} )
  async.series([
    function (next) { this.getCommunicationInit(next) }.bind(this),
    function (next) { this.getTheirPrivKey(next) }.bind(this)],
    function (err, comms) {
      if (err) cb(err)
      var commInit = comms[0]
      var commPrivKey = comms[1]

      // If we can't compute, then it's ok to merely indicate this:
      if ((!commInit) || (!commPrivKey)) cb(null, null)

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
    if (res) { throw new InvalidCommunication() }
    chat.save(this.privKey.toWIF(), cb)
  }.bind(this))
}

// Der passing is supported only for the purpose of making tests completely
// deterministic
Session.prototype.authenticate = function (next, derEncoding) {
  // TODO I think we should create a _withNegotiation(function (init, auth, their) {} )
  async.series([
    function (next) { this.getCommunicationInit(next) }.bind(this),
    function (next) { this.getCommunicationAuth(next) }.bind(this)],
    function (err, comms) {
      if (err) next(err)
      var commInit = comms[0]
      var commAuth = comms[1]

      var isInit = ((!commInit) || (!!commAuth && !!commInit))

      // If we're already authenticated, we'll try to re-initialize. Presumably
      // one would want to do this if they lost a secret key, or that key were
      // somehow compromised
      if (!isInit && !!derEncoding) throw new DerAlreadyExistsError()

      if (!derEncoding && this.withChat) {
        derEncoding = this.withChat.der
      }

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
    if (err) cb(err)
    if (!isAuthenticated) throw new NotAuthenticatedError()

    this.symmKey(function (err, symmKey) {
      if (err) cb(err)

      if (!iv) iv = crypto.randomBytes(16)

      var key = symmKey.slice(0, 32)
      var cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv)

      this._chatCreate({iv: iv,
        contents: Buffer.concat([cipher.update(contents), cipher.final()])}, cb)
    }.bind(this))
  }.bind(this))
}

Session.prototype.communications = function (cb) {
  this.isAuthenticated(function (err, isAuthenticated) {
    if (err) cb(err)
    if (!isAuthenticated) cb(null, [])

    this.symmKey(function (err, symmKey) {
      if (err) cb(err)
      this.getCommunicationInit(function (err, commInit) {
        if (err) cb(err)
        this.getMessages({startBlock: commInit.blockHeight},
          function (err, messages) {
            if (err) cb(err)
            cb(null, messages.filter(function (msg) { return !msg.isAuth() })
              .map(function (msg) { msg.symmKey = symmKey; return msg }))
          })
      }.bind(this))
    }.bind(this))
  }.bind(this))
}

Session.all = function (connection, addr, cb) {
  connection.messagesByAddr(addr, {type: 'COMMUN'}, function (err, messages) {
    if (err) cb(err)

    cb(null, messages.filter(function (msg) { return msg.isInit() }))
  })
}

module.exports = {
  Session: Session
}
