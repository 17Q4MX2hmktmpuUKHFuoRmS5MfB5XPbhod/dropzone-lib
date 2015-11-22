/* global describe it */
/* eslint no-new: 0 */

var assert = require('assert')
var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore-lib')

var session = require('../lib/session')
var blockchain = require('../lib/blockchain')

var fixtures = require('./fixtures/session')
var globals = require('./fixtures/globals')

var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var Session = session.Session
var testnet = bitcore.Networks.testnet

blockchain.use('fake')                    

describe('Session', function () {

  it('performs a simple non-deterministic chat', function (nextSpec) {

    // New Buyer to Seller Connection:
    var testerPrivKey = PrivateKey.fromWIF(globals.testerPrivateKey)
    var tester2PrivKey = PrivateKey.fromWIF(globals.tester2PrivateKey)
    var receiverAddr = globals.tester2PublicKey

    async.waterfall([
      function(next) {
        // Buyer initiates Authentication:
        var secret = crypto.randomBytes(128).toString('hex')

        var session = new Session(testerPrivKey, secret, 
          {receiverAddr: receiverAddr})

        session.authenticate(next)
      },function (next){
        // Get the session id
        Session.all(tester2PrivKey, testnet, function (err, sessions) {
          if (err) return next(err)

          next(null, sessions[0].txId)
        })
      },function (next,sessionTxId){
        // Seller Authenticates the Buyer
        Session.one(tester2PrivKey, testnet, sessionTxId, function (err, session) {
          session.authenticate(function (err) {
            if (err) return next(err)
            next(null, sessionTxId)
          })
        })
      },
      function (next, sessionTxId) {
        // Seller talks to Buyer:
        Session.one(testerPrivKey, tesnet, txId, function (err, session) {
          if (err) return next(err)

          // TODO: a lot of this should just move into the sendMessage 
          // (along with the error tests from the actions.js)
          var message = new Chat({ contents: 'Hello Buyer' })
          var symmKey = session.genSymmKey()
          message.encrypt(symmKey)
          session.sendMessage(message, function (err, message) {
            if (err) return next(err)
            next(null, sessionTxId)
          })
        })
      },
      function (next, sessionTxId) {
        // Buyer talks to Seller:
        Session.one(tester2PrivKey, tesnet, txId, function (err, session) {
          if (err) return next(err)

          var message = new Chat({ contents: 'Hello Seller' })
          var symmKey = session.genSymmKey()
          message.encrypt(symmKey)
          session.sendMessage(message, function (err, message) {
            if (err) return next(err)
            next(null, sessionTxId)
          })
        })
      },
      function(next, sessionTxId) {
        async.map([testerPrivKey,tester2PrivKey], function(err,privKey,mapNext) {
          Session.one(privKey, tesnet, sessionTxId, function (err, session) {
            if (err) return next(err)
            mapNext(null, session.messages)
          })
        }, next)
      }
    ], function (err, userMessages) {
        assert.deepEqual(userMessages[0], ['Hello Seller', 'Hello Buyer'])
        assert.deepEqual(userMessages[1], ['Hello Seller', 'Hello Buyer'])
        nextSpec()
    })
  })
})
