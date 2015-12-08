/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')
var crypto = require('crypto')
var async = require('async')
var bitcore = require('bitcore-lib')

var expect = chai.expect

var fakeConnection = require('../lib/drivers/fake')
var session = require('../lib/session')

var globals = require('./fixtures/globals')
var globalsSession = require('./fixtures/session')

var PrivateKey = bitcore.PrivateKey
var Session = session.Session

describe('Session', function () {
  var connection = null

  before(function (next) {
    connection = new fakeConnection.FakeBitcoinConnection(function (err) {
      if (err) throw err
      next()
    })
  })

  afterEach(function (next) {
    connection.clearTransactions(function (err) {
      if (err) throw err
      next()
    })
  })

  it('performs a simple non-deterministic chat', function (nextSpec) {
    // The entropy generation takes a bit:
    this.timeout(15000)

    async.series([
      function (next) {
        // Buyer initiates Authentication To Seller:
        var buyerToSeller = new Session(connection, globals.testerPrivateKey, 
          crypto.randomBytes(128), {receiverAddr: globals.tester2PublicKey})

        buyerToSeller.authenticate(function (err, chatInit) {
          if (err) throw err
          next(null, buyerToSeller)
        })
      }, function (next) {
        // Seller initiates Authentication To Buyer
        Session.all(connection, globals.tester2PublicKey, function (err, sessions) {
          if (err) return next(err)

          expect(sessions.length).to.equal(1)

          var sellerToBuyer = new Session(connection,
            globals.tester2PrivateKey, crypto.randomBytes(128),
            {withChat: sessions[0]})

          sellerToBuyer.authenticate(function (err, chatAuth) {
            if (err) return next(err)
            next(null, sellerToBuyer)
          })
        })
      }],
      function (err, sessions) {
        if (err) throw err
        var buyerToSeller = sessions[0]
        var sellerToBuyer = sessions[1]

        async.series([
          function (next) { sellerToBuyer.send('Hello Buyer', next) },
          function (next) { buyerToSeller.send('Hello Seller', next) },
          function (next) { sellerToBuyer.communications(next) },
          function (next) { buyerToSeller.communications(next) }
        ],
        function (err, communications) {
          if (err) throw err

          var sellerToBuyerContents = communications[2].map(
            function (comm) { return comm.contentsPlain() })
          var buyerToSellerContents = communications[3].map(
            function (comm) { return comm.contentsPlain() })

          expect(sellerToBuyerContents).to.deep.equal(['Hello Seller',
            'Hello Buyer'])
          expect(buyerToSellerContents).to.deep.equal(['Hello Seller',
            'Hello Buyer'])

          nextSpec()
        })
      })
  })

  it('extended deterministic chat test', function (nextSpec) {
    var buyerToSeller
    var sellerToBuyer

    async.series([
      function (next) {
        /* 
         * Step One: Buyer initializes channel.
         *
         * Der is not actually required, but since we're keeping the tests
         * deterministic, I'm passing it here. Additionally, this speeds up 
         * testing:
         */
        buyerToSeller = new Session(connection, globals.tester2PrivateKey, 
          new Buffer(globalsSession.buyerSecret, 'hex'), 
          {receiverAddr: globals.testerPublicKey})

        expect(buyerToSeller.senderAddr).to.equal(globals.tester2PublicKey)
        expect(buyerToSeller.privKey).to.equal(globals.tester2PrivateKey)

        buyerToSeller.authenticate(function (err, chatInit) {
          if (err) throw err

          // Test the initialization:
          expect(chatInit.receiverAddr).to.equal(globals.testerPublicKey)
          expect(chatInit.senderAddr).to.equal(globals.tester2PublicKey)
          expect(chatInit.der.toString('hex')).to.equal(globalsSession.der)

          expect(chatInit.sessionPrivKey.toString('hex')).to.equal(
            globalsSession.buyerPubkey)
          expect(chatInit.iv).to.be.undefined
          expect(chatInit.contents).to.be.undefined

          chatInit.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
          })

          buyerToSeller.isAuthenticated(function (err, isAuthenticated) {
            if (err) throw err
            expect(isAuthenticated).to.be.false
          })

          next(null, buyerToSeller)
        }, new Buffer(globalsSession.der, 'hex'))
      }, function (next) {
        /* 
         * Step Two: Seller authenticates request.
         */
        Session.all(connection, globals.testerPublicKey, function (err, sessions) {
          if (err) return next(err)

          expect(sessions.length).to.equal(1)

          sellerToBuyer = new Session(connection, globals.testerPrivateKey, 
            new Buffer(globalsSession.sellerSecret, 'hex'), 
            {withChat: sessions[0]})

          sellerToBuyer.isAuthenticated(function (err, isAuthenticated) {
            if (err) throw err
            expect(isAuthenticated).to.be.false
          })

          buyerToSeller.isAuthenticated(function (err, isAuthenticated) {
            if (err) throw err
            expect(isAuthenticated).to.be.false
          })

          sellerToBuyer.authenticate(function (err, chatAuth) {
            if (err) return next(err)

            // Test the authentication:
            expect(chatAuth.receiverAddr).to.equal(globals.tester2PublicKey)
            expect(chatAuth.senderAddr).to.equal(globals.testerPublicKey)
            expect(chatAuth.der).to.be.undefined
            expect(chatAuth.sessionPrivKey.toString('hex')).to.equal(
              globalsSession.sellerPubkey)
            expect(chatAuth.iv).to.be.undefined
            expect(chatAuth.contents).to.be.undefined

            chatAuth.isValid(function (err, res) {
              if (err) throw err
              expect(res).to.be.null
            })

            buyerToSeller.communications(function (err, chats) {
              if (err) throw err
              expect(chats.length).to.equal(0)
            })
            sellerToBuyer.communications(function (err, chats) {
              if (err) throw err
              expect(chats.length).to.equal(0)
            })

            buyerToSeller.symmKey(function (err, symmKey) {
              if (err) throw err
              expect(symmKey.toString('hex')).to.equal(globalsSession.symmKey)
            })
            buyerToSeller.isAuthenticated(function (err, isAuthenticated) {
              if (err) throw err
              expect(isAuthenticated).to.be.true
            })

            sellerToBuyer.symmKey(function (err, symmKey) {
              if (err) throw err
              expect(symmKey.toString('hex')).to.equal(globalsSession.symmKey)
            })
            sellerToBuyer.isAuthenticated(function (err, isAuthenticated) {
              if (err) throw err
              expect(isAuthenticated).to.be.true
            })

            next(null, sellerToBuyer)
          })
        })
      }],
      function (err, sessions) {
        if (err) throw err
        var buyerToSeller = sessions[0]
        var sellerToBuyer = sessions[1]

        async.series([
          function (next) { 
            sellerToBuyer.send('Hello Buyer', next, 
              new Buffer('4941fbbf24517885502b85a0f3285659','hex'))
          },
          function (next) { 
            buyerToSeller.send('Hello Seller', next, 
              new Buffer('02ff94080d10f3361d69e9770dca9982','hex'))
          },
          function (next) { sellerToBuyer.communications(next) },
          function (next) { buyerToSeller.communications(next) }
        ],
        function (err, communications) {
          if (err) throw err

          var sellerHelloComm = communications[0]
          var buyerHelloComm = communications[1]

          expect(sellerHelloComm.receiverAddr).to.equal(globals.tester2PublicKey)
          expect(sellerHelloComm.senderAddr).to.equal(globals.testerPublicKey)
          expect(sellerHelloComm.der).to.be.undefined
          expect(sellerHelloComm.sessionPrivKey).to.be.undefined
          expect(sellerHelloComm.iv.toString('hex')).to.equal(
            '4941fbbf24517885502b85a0f3285659')
          expect(sellerHelloComm.contents.toString('hex')).to.equal(
            '2924a61b305a8070c0c41496482d1a3a')

          sellerHelloComm.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
          })

          expect(buyerHelloComm.receiverAddr).to.equal(globals.testerPublicKey)
          expect(buyerHelloComm.senderAddr).to.equal(globals.tester2PublicKey)
          expect(buyerHelloComm.der).to.be.undefined
          expect(buyerHelloComm.sessionPrivKey).to.be.undefined
          expect(buyerHelloComm.iv.toString('hex')).to.equal(
            '02ff94080d10f3361d69e9770dca9982')
          expect(buyerHelloComm.contents.toString('hex')).to.equal(
            'fa753c555ae1d87b22ee40d0879d0ee0')

          buyerHelloComm.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
          })

          var sellerToBuyerContents = communications[2].map(
            function (comm) { return comm.contentsPlain() })
          var buyerToSellerContents = communications[3].map(
            function (comm) { return comm.contentsPlain() })

          expect(sellerToBuyerContents).to.deep.equal(['Hello Seller',
            'Hello Buyer'])
          expect(buyerToSellerContents).to.deep.equal(['Hello Seller',
            'Hello Buyer'])

          nextSpec()
        })
      })
  })
})
