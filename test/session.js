/* global describe it before after */
/* eslint no-new: 0 */

var assert = require('assert')
var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore-lib')

var fakeConnection = require('../lib/drivers/fake')
var session = require('../lib/session')
var messages = require('../lib/messages')

var globals = require('./fixtures/globals')

var PrivateKey = bitcore.PrivateKey
var testnet = bitcore.Networks.testnet // TODO: nix?

var Session = session.Session
var Chat = messages.Chat

describe('Session', function () {
  var connection = null

  before(function (next) {
    connection = new fakeConnection.FakeBitcoinConnection(function (err) {
      if (err) throw err
      next()
    })
  })

  after(function (next) {
    connection.clearTransactions(function (err) {
      if (err) throw err
      next()
    })
  })

  it('performs a simple non-deterministic chat', function (nextSpec) {
    // The entropy generation takes a bit:
    this.timeout(10000)

    // New Buyer to Seller Connection:
    var testerPrivKey = PrivateKey.fromWIF(globals.testerPrivateKey)
    var tester2PrivKey = PrivateKey.fromWIF(globals.tester2PrivateKey)
    var tester2PubKey = globals.tester2PublicKey

    var buyerSecret = crypto.randomBytes(128).toString('hex')
    var sellerSecret = crypto.randomBytes(128).toString('hex')

    async.series([
      function (next) {
        // Buyer initiates Authentication To Seller:
        var buyerToSeller = new Session(connection, testerPrivKey, buyerSecret,
          {receiverAddr: tester2PubKey})

        buyerToSeller.authenticate(function(err, chatInit) { 
          next(null, buyerToSeller) // TODO: can we pass this instead? 
        })
      }, function (next) {
        // Seller initiates Authentication To Buyer
        var sellerToBuyer

        Session.all(connection, tester2PubKey, function (err, sessions) {
          if (err) return next(err)
          if (sessions.length == 0) return next("Couldn't retrieve session")

          var sellerToBuyer = new Session(connection, tester2PrivKey, sellerSecret,
            {withChat: sessions[0]})

          sellerToBuyer.authenticate(function(err, chatAuth) {
            next(null, sellerToBuyer) // TODO: Can we pass this instead?
          })
        })
      }], function(err, sessions){
        buyerToSeller = sessions[0]
        sellerToBuyer = sessions[1]

        async.series([
          function (next) { sellerToBuyer.send("Hello Buyer", next) },
          function (next) { buyerToSeller.send("Hello Seller", next) },
          function (next) { sellerToBuyer.communications(next) },
          function (next) { buyerToSeller.communications(next) }
        ],function(err, communications) {
          sellerToBuyerContents = communications[2].map(function (comm) { 
            return comm.contentsPlain()})
          buyerToSellerContents = communications[3].map(function (comm) { 
            return comm.contentsPlain()})

          expect(sellerToBuyerContents).to.deep.equal(["Hello Seller", "Hello Buyer"])
          expect(buyerToSellerContents).to.deep.equal(["Hello Seller", "Hello Buyer"])
        })
    })
  })
})
