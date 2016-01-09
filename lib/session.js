/**
 * @file Contains the Session object, and all Session related errors
 * @module session
 */
var extend = require('shallow-extend')
var inherits = require('inherits')
var async = require('async')
var crypto = require('crypto')
var asn = require('asn1.js')
var bitcore = require('bitcore-lib')

var messages = require('./messages')
var DropzoneError = require('./dropzone_error')

var $ = bitcore.util.preconditions

var BN = asn.bignum
var Chat = messages.Chat

var DHDER = asn.define('DH', function () {
  this.seq().obj(this.key('p').int(), this.key('g').int())
})

var CIPHER_ALGORITHM = 'aes-256-cbc'

/**
 * This error is returned when the value of the 'with' parameter in the session
 * constructor cannot be paired against the history of the provided private key
 * and/or session secret
 *
 * @class InvalidWithReceiverError
 */
function InvalidWithReceiverError () {
  DropzoneError.call(this, 'provided chat is between incompatible parties')
}

/**
 * Something went wrong with decryption. Either the provided key was incorrect, 
 * or a message was manipulated
 *
 * @class InvalidCommunication
 */
function InvalidCommunication () {
  DropzoneError.call(this, 'the computed chat messages was invalid')
}

/**
 * A session requires a recipient in order to be meaningful
 *
 * @class MissingReceiverError
 */
function MissingReceiverError () {
  DropzoneError.call(this, 'missing receiver')
}

/**
 * A conversation was attempted prior to the symmetric key exchange completing
 *
 * @class NotAuthenticatedError
 */
function NotAuthenticatedError () {
  DropzoneError.call(this, 'the conversation is not yet authenticated')
}

/**
 * An attempt to furnish a der occurred, after a der had already been provided
 *
 * @class NotAuthenticatedError
 */
function DerAlreadyExistsError () {
  DropzoneError.call(this, 'the der was provided, yet already exists')
}

/**
 * A Session object represents the state of a communications exchange between
 * two people. Sessions are what create and read Chat messages, decrypt 
 * communications, and negotiate encryption between parties.
 *
 * @class Session
 * @param {Driver} connection - blockchain connection
 * @param {String} privKey - Private key of the user's testnet addres
 * @param {Buffer} sessionSecret - the 128 byte session private key, used for 
 *  negotiating a shared secret.
 * @param {Object} options
 * @param {Integer} options.endBlock - The highest block to search for messages
 * @param {String} options.receiverAddr - The receiving party's address. This
 *  is required when starting a new session. (and never otherwise)
 * @param {Chat} options.withChat - The Chat initiation message that will be used as the 
 *  basis for the session. This is required if receiverAddr is not specified.
 */
function Session (connection, privKey, sessionSecret, options) {
  $.checkArgument(connection,
    'First argument is required, please include a connection.')
  $.checkArgument(privKey,
    'Second argument is required, please include a privkey.')
  $.checkArgument(privKey,
    'Third argument is required, please include a sessionSecret.')

  if (!options) options = {}

  /**
   * Returns the connection that this Session is querying against
   *
   * @name module:session~Session#connection
   * @type Driver
  */ 
  this.__defineGetter__('connection', function () { return connection })
  /**
    The user's Bitcoin private key. Probably/certainly a testnet private key 

    @name module:session~Session#privKey
    @type String
  */ 
  this.__defineGetter__('privKey', function () { return privKey })
  /**
    A 128 byte private key for encrypting this Session's communications. Expected
    to be provided as a Buffer object.

    @name module:session~Session#sessionKey
    @type Buffer
  */ 
  this.__defineGetter__('sessionKey', function () { return sessionSecret })
  /**
    Don't search higher than the specified block height.

    @name module:session~Session#endBlock
    @type Integer
    @default null
  */ 
  this.__defineGetter__('endBlock', function () { return options.endBlock })
  /**
    The public address of the user who's private key was passed in the 
    constructor's privKey argument.

    @name module:session~Session#senderAddr
    @type Integer
  */ 
  this.__defineGetter__('senderAddr', function () {
    return connection.privkeyToAddr(this.privKey)
  })

  /**
    The public testnet addresses of the two parties engaged in this session.
    senderAddr is listied before receiverAddr.

    @name module:session~Session#between
    @type Integer
  */ 
  this.__defineGetter__('between', function () {
    return [this.senderAddr, this.receiverAddr]
  })

  var receiverAddr

  if (options.receiverAddr) {
    // We're creating a new session:
    receiverAddr = options.receiverAddr
  } else if (options.withChat) {
    /**
      If the withChat option was passed in the constructor, this returns the
      chat initiation message that this sender is authenticating against.

      @name module:session~Session#withChat
      @type Integer
      @default null
    */ 
    this.__defineGetter__('withChat', function () { return options.withChat })

    if (this.withChat.receiverAddr !== this.senderAddr) {
      throw new InvalidWithReceiverError()
    }

    receiverAddr = this.withChat.senderAddr
  } else {
    throw new MissingReceiverError()
  }

  /**
    The public address of the user who is the recipient of this communication.

    @name module:session~Session#receiverAddr
    @type String
  */ 
  this.__defineGetter__('receiverAddr', function () { return receiverAddr })
}

Session.prototype._createDhFromDer = function (der) {
  return crypto.createDiffieHellman(der.p.toString(16), 'hex',
    /* NOTE: There's a bug in crypto-browserify whereby any string
     * representation of the generator seems to break the tests. I'm not
     * sure that this will work for all generator values, but it seems to
     * work well enough with extensive testing:
     */
    new Buffer([der.g]))
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


Session.prototype._getChats = function (options, cb) {
  if (!options) options = {}
  options.type = 'COMMUN'
  options.between = this.between
  if (this.endBlock) options.endBlock = this.endBlock

  this.connection.messagesByAddr(this.senderAddr, options, cb)
}

/**
 * Retrieve all chat initialization requests between this sender and receiver
 *
 * @function 
 * @param {function} cb - Callback to receive array of chat messages 
 *  in the form: function(err, messages) 
 */
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

/**
 * Retrieve all chat initialization acknowledgements (aka authorizations) 
 * between this sender and receiver
 *
 * @function 
 * @param {function} cb - Callback to receive array of chat messages 
 *  in the form: function(err, messages) 
 */
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

/**
 * Retrieve the negotiation messages for this session (init and auth)
 *
 * @function 
 * @param {function} cb - Callback to receive negotiation messages
 *  in the form: function(err, commInit, commAuth) 
 */
Session.prototype.getNegotiation = function (cb) {
  async.series([
    function (next) { this.getCommunicationInit(next) }.bind(this),
    function (next) { this.getCommunicationAuth(next) }.bind(this)],
    function (err, comms) {
      if (err) return cb(err)
      cb(null, comms[0], comms[1])
    })
}

/**
 * Retrieve authentication/negotiation status of the current session
 *
 * @function 
 * @param {function} cb - Callback to receive the computed status
 *  in the form: function(err, isAuthenticated) 
 */
Session.prototype.isAuthenticated = function (cb) {
  this.getNegotiation(function (err, commInit, commAuth) {
    if (err) return cb(err)
    cb(null, [commInit, commAuth].every(function (c) { return c }))
  })
}

/**
 * Get the negotiated Diffie Helmann symmetric key being used in this session.
 * Note that this isn't the supplied private key, this is the negotiated secret
 * between the communicating parties, and will be a 128 byte Buffer
 *
 * @function 
 * @param {function} cb - Callback to receive the computed status
 *  in the form: function(err, symmKey) 
 */
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

    var dh = this._createDhFromDer(DHDER.decode(commInit.der, 'der'))
    dh.setPrivateKey(this.sessionKey)
    dh.generateKeys()

    cb(null, dh.computeSecret(commPrivKey.sessionPrivKey))
  }.bind(this))
}

/**
 * Authenticate this session against an initiator's request. If the session is
 * authenticated already an error will be returned.
 *
 * @function 
 * @param {function} next - Callback to receive the broadcasted chat authorization
 *  message in the form: function(err, chat) 
 * @param {Buffer} derEncoding - Optional. Der's are randomly generated and not
 *  intended to be supplied other than for the purposed of determininstically
 *  testing this codebase.
 */
Session.prototype.authenticate = function (next, derEncoding) {
  this.getNegotiation(function (err, commInit, commAuth) {
    if (err) return next(err)

    var isInit = ((!commInit) || (!!commAuth && !!commInit))

    // If we're already authenticated, we'll try to re-initialize. Presumably
    // one would want to do this if they lost a secret key, or that key were
    // somehow compromised
    if (!isInit && !!derEncoding) return next(new DerAlreadyExistsError())

    if (!derEncoding && this.withChat) derEncoding = this.withChat.der

    var dh = (derEncoding)
      ? this._createDhFromDer(DHDER.decode(new Buffer(derEncoding), 'der'))
      : crypto.createDiffieHellman(1024)

    dh.setPrivateKey(this.sessionKey)
    dh.generateKeys()

    var der = DHDER.encode({ p: new BN(dh.getPrime('hex'), 16),
      g: new BN(dh.getGenerator('hex'), 16) }, 'der')

    this._chatCreate({ sessionPrivKey: dh.getPublicKey(),
      der: (isInit) ? der : null }, next)
  }.bind(this))
}

/**
 * Send a plain-text message to the receiver in this Session channel.
 *
 * @function 
 * @param {String} contents - Plain-text string of the message you wish to send
 * @param {function} cb - Callback to receive the broadcasted chat message
 *  message in the form: function(err, chat) 
 * @param {Buffer} iv - Optional 16 byte number.  Iv passing is 
 *  supported only for the purpose of making tests completely deterministic. 
 *  Otherwise, a random number is used for this purpose.
 */
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

/**
 * List all the decrypted chats that have been sent over this channel between
 * the sender and receiver.
 *
 * @function 
 * @param {function} cb - Callback to receive the chat messages in the form: 
 *  function(err, chats). Note that these chats will have been seeded with the
 *  symmKey for the purpose of retrieving their contentsPlain()
 */
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

/**
 * List all outstanding chat initiation requests over supplied address
 *
 * @function 
 * @param {Driver} connection - blockchain connection
 * @param {String} addr - Public (testnet) Address to query for requests
 * @param {function} cb - Callback to receive the initation chat messages in 
 *  the form: function(err, chats). 
 */
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
