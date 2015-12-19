/* global describe it before afterEach */
/* eslint no-new: 0 */

var chai = require('chai')
var crypto = require('crypto')
var async = require('async')

var expect = chai.expect

var fakeConnection = require('../lib/drivers/fake')
var session = require('../lib/session')

var globals = require('./fixtures/globals')
var globalsSession = require('./fixtures/session')

var Session = session.Session

var getDecrypted = function (c) { return c.contentsPlain() }

/* NOTE: This version differs from the ruby tests in that secret's and der's
 * are provided to new and authenticate on the init messages. This drastically
 * speeds up tests, though should be omitted in production
 */

describe('Session', function () {
  var connection = null

  before(function (next) {
    connection = new fakeConnection.FakeBitcoinConnection(next)
  })

  afterEach(function (next) { connection.clearTransactions(next) })

  // NOTE: The ruby version is non-deterministic, but due to the RNG time, I
  // decided to furnish a der and secret rather than crypto.randomBytes(128)
  it('performs a simple non-deterministic chat', function (nextSpec) {
    async.series([
      function (next) {
        // Buyer initiates Authentication To Seller:
        var buyerToSeller = new Session(connection, globals.testerPrivateKey,
          new Buffer(globalsSession.sessionSecret1, 'hex'),
          {receiverAddr: globals.tester2PublicKey})

        buyerToSeller.authenticate(function (err, chatInit) {
          if (err) throw err
          next(null, buyerToSeller)
        }, new Buffer(globalsSession.der1, 'hex'))
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
          function (next) { sellerToBuyer.getCommunications(next) },
          function (next) { buyerToSeller.getCommunications(next) }
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
    var chatInit
    var chatAuth
    var sellerHelloComm
    var buyerHelloComm

    async.series([
      /*
       * Step One: Buyer initializes channel.
       */
      function (next) {
        buyerToSeller = new Session(connection, globals.tester2PrivateKey,
          new Buffer(globalsSession.buyerSecret, 'hex'),
          {receiverAddr: globals.testerPublicKey})

        expect(buyerToSeller.senderAddr).to.equal(globals.tester2PublicKey)
        expect(buyerToSeller.privKey).to.equal(globals.tester2PrivateKey)

        next(null, null)
      }, function (next) {
        buyerToSeller.authenticate(function (err, chat) {
          if (err) throw err
          chatInit = chat

          expect(chatInit.receiverAddr).to.equal(globals.testerPublicKey)
          expect(chatInit.senderAddr).to.equal(globals.tester2PublicKey)
          expect(chatInit.der.toString('hex')).to.equal(globalsSession.der)

          expect(chatInit.sessionPrivKey.toString('hex')).to.equal(
            globalsSession.buyerPubkey)
          expect(chatInit.iv).to.be.undefined
          expect(chatInit.contents).to.be.undefined

          next(null, null)
        }, new Buffer(globalsSession.der, 'hex'))
      }, function (next) {
        chatInit.isValid(function (err, res) {
          if (err) throw err

          expect(res).to.be.null

          next(null, null)
        })
      }, function (next) {
        buyerToSeller.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err

          expect(isAuthenticated).to.be.false

          next(null, null)
        })
      },
      /*
       * Step Two: Seller authenticates request.
       */
      function (next) {
        Session.all(connection, globals.testerPublicKey, function (err, sessions) {
          if (err) return next(err)

          expect(sessions.length).to.equal(1)

          sellerToBuyer = new Session(connection, globals.testerPrivateKey,
            new Buffer(globalsSession.sellerSecret, 'hex'),
            {withChat: sessions[0]})

          next(null, null)
        })
      }, function (next) {
        sellerToBuyer.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err
          expect(isAuthenticated).to.be.false
          next(null, null)
        })
      }, function (next) {
        buyerToSeller.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err
          expect(isAuthenticated).to.be.false
          next(null, null)
        })
      }, function (next) {
        sellerToBuyer.authenticate(function (err, chat) {
          if (err) return next(err)
          chatAuth = chat

          expect(chatAuth.receiverAddr).to.equal(globals.tester2PublicKey)
          expect(chatAuth.senderAddr).to.equal(globals.testerPublicKey)
          expect(chatAuth.der).to.be.undefined
          expect(chatAuth.sessionPrivKey.toString('hex')).to.equal(
            globalsSession.sellerPubkey)
          expect(chatAuth.iv).to.be.undefined
          expect(chatAuth.contents).to.be.undefined

          next(null, null)
        })
      }, function (next) {
        chatAuth.isValid(function (err, res) {
          if (err) throw err
          expect(res).to.be.null
          next(null, null)
        })
      }, function (next) {
        buyerToSeller.getCommunications(function (err, chats) {
          if (err) throw err
          expect(chats.length).to.equal(0)
          next(null, null)
        })
      }, function (next) {
        sellerToBuyer.getCommunications(function (err, chats) {
          if (err) throw err
          expect(chats.length).to.equal(0)
          next(null, null)
        })
      }, function (next) {
        buyerToSeller.getSymmKey(function (err, symmKey) {
          if (err) throw err
          expect(symmKey.toString('hex')).to.equal(globalsSession.symmKey)
          next(null, null)
        })
      }, function (next) {
        buyerToSeller.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err
          expect(isAuthenticated).to.be.true
          next(null, null)
        })
      }, function (next) {
        sellerToBuyer.getSymmKey(function (err, symmKey) {
          if (err) throw err
          expect(symmKey.toString('hex')).to.equal(globalsSession.symmKey)
          next(null, null)
        })
      }, function (next) {
        sellerToBuyer.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err
          expect(isAuthenticated).to.be.true
          next(null, null)
        })
      },
      /*
       * Step Three: Chatting commences
       */
      function (next) {
        sellerToBuyer.send('Hello Buyer', function (err, chat) {
          if (err) throw err
          sellerHelloComm = chat

          expect(sellerHelloComm.receiverAddr).to.equal(globals.tester2PublicKey)
          expect(sellerHelloComm.senderAddr).to.equal(globals.testerPublicKey)
          expect(sellerHelloComm.der).to.be.undefined
          expect(sellerHelloComm.sessionPrivKey).to.be.undefined
          expect(sellerHelloComm.iv.toString('hex')).to.equal(
            '4941fbbf24517885502b85a0f3285659')
          expect(sellerHelloComm.contents.toString('hex')).to.equal(
            '2924a61b305a8070c0c41496482d1a3a')

          next(null, null)
        }, new Buffer('4941fbbf24517885502b85a0f3285659', 'hex'))
      }, function (next) {
        sellerHelloComm.isValid(function (err, res) {
          if (err) throw err
          expect(res).to.be.null
          next(null, null)
        })
      }, function (next) {
        buyerToSeller.send('Hello Seller', function (err, chat) {
          if (err) throw err
          buyerHelloComm = chat

          expect(buyerHelloComm.receiverAddr).to.equal(globals.testerPublicKey)
          expect(buyerHelloComm.senderAddr).to.equal(globals.tester2PublicKey)
          expect(buyerHelloComm.der).to.be.undefined
          expect(buyerHelloComm.sessionPrivKey).to.be.undefined
          expect(buyerHelloComm.iv.toString('hex')).to.equal(
            '02ff94080d10f3361d69e9770dca9982')
          expect(buyerHelloComm.contents.toString('hex')).to.equal(
            'fa753c555ae1d87b22ee40d0879d0ee0')

          next(null, null)
        }, new Buffer('02ff94080d10f3361d69e9770dca9982', 'hex'))
      }, function (next) {
        buyerHelloComm.isValid(function (err, res) {
          if (err) throw err
          expect(res).to.be.null
          next(null, null)
        })
      }, function (next) {
        sellerToBuyer.getCommunications(function (err, chats) {
          if (err) throw err

          expect(chats.map(function (c) { return c.contentsPlain() })).to.deep.equal(
            ['Hello Seller', 'Hello Buyer'])

          next(null, null)
        })
      }, function (next) {
        buyerToSeller.getCommunications(function (err, chats) {
          if (err) throw err

          expect(chats.map(function (c) { return c.contentsPlain() })).to.deep.equal(
            ['Hello Seller', 'Hello Buyer'])

          next(null, null)
        })
      }
    ], function (err, sessions) {
      if (err) throw err

      nextSpec()
    })
  })

  it('Requires that session must authenticate before chatting', function (nextSpec) {
    var buyerToSeller
    var sellerToBuyer

    async.series([
      function (next) {
        // Create a session, authenticate it, and then try opening it with a bad pass
        buyerToSeller = new Session(connection, globals.testerPrivateKey,
          new Buffer(globalsSession.buyerSecret, 'hex'),
          {receiverAddr: globals.tester2PublicKey})

        next()
      }, function (next) {
        buyerToSeller.send('Hello Buyer', function (err, chat) {
          expect(err).to.deep.equal(new session.NotAuthenticatedError())
          next()
        })
      }, function (next) {
        buyerToSeller.authenticate(next, new Buffer(globalsSession.der, 'hex'))
      }, function (next) {
        buyerToSeller.send('Hello Buyer', function (err, chat) {
          expect(err).to.deep.equal(new session.NotAuthenticatedError())
          next()
        })
      }, function (next) {
        // Seller creates connection To Buyer
        Session.all(connection, globals.tester2PublicKey, function (err, sessions) {
          if (err) return next(err)

          expect(sessions.length).to.equal(1)

          sellerToBuyer = new Session(connection, globals.tester2PrivateKey,
            new Buffer(globalsSession.sellerSecret, 'hex'),
            {withChat: sessions[0]})
          next()
        })
      }, function (next) {
        sellerToBuyer.send('Hello Buyer', function (err, chat) {
          expect(err).to.deep.equal(new session.NotAuthenticatedError())
          next()
        })
      }],
      function (err, sessions) {
        if (err) throw err
        nextSpec()
      })
  })

  it('supports multiple chats sessions by a seller', function (nextSpec) {
    var buyerToSeller1
    var buyerToSeller2
    var sellerToBuyer1
    var sellerToBuyer2

    buyerToSeller1 = new Session(connection, globals.tester2PrivateKey,
      new Buffer(globalsSession.sessionSecret1, 'hex'),
      {receiverAddr: globals.testerPublicKey})

    buyerToSeller2 = new Session(connection, globals.tester3PrivateKey,
      new Buffer(globalsSession.sessionSecret2, 'hex'),
      {receiverAddr: globals.testerPublicKey})

    async.series([
      // Authentications:
      function (next) {
        buyerToSeller1.authenticate(next,
          new Buffer(globalsSession.der1, 'hex'))
      },
      function (next) {
        buyerToSeller2.authenticate(next,
          new Buffer(globalsSession.der2, 'hex'))
      },
      function (next) {
        Session.all(connection, globals.testerPublicKey,
          function (err, sessions) {
            if (err) return next(err)

            expect(sessions.length).to.equal(2)

            sellerToBuyer2 = new Session(connection, globals.testerPrivateKey,
              crypto.randomBytes(128), {withChat: sessions[0]})

            sellerToBuyer1 = new Session(connection, globals.testerPrivateKey,
              crypto.randomBytes(128), {withChat: sessions[1]})

            next()
          })
      },
      function (next) { sellerToBuyer1.authenticate(next) },
      function (next) { sellerToBuyer2.authenticate(next) },
      // Chats commence:
      function (next) { sellerToBuyer1.send('Hello Buyer1', next) },
      function (next) { buyerToSeller1.send('Hello from Buyer1', next) },
      function (next) { sellerToBuyer2.send('Hello Buyer2', next) },
      function (next) { buyerToSeller2.send('Hello from Buyer2', next) }
    ],
    function (err, sessions) {
      if (err) throw err

      async.mapSeries([sellerToBuyer1, buyerToSeller1, sellerToBuyer2, buyerToSeller2],
        function (session, next) {
          session.getCommunications(function (err, chats) {
            if (err) throw err
            next(null, chats.map(getDecrypted))
          })
        },
        function (err, results) {
          if (err) throw err

          expect(results[0]).to.deep.equal([ 'Hello from Buyer1',
            'Hello Buyer1' ])
          expect(results[1]).to.deep.equal([ 'Hello from Buyer1',
            'Hello Buyer1' ])
          expect(results[2]).to.deep.equal([ 'Hello from Buyer2',
            'Hello Buyer2' ])
          expect(results[3]).to.deep.equal([ 'Hello from Buyer2',
            'Hello Buyer2' ])

          nextSpec()
        })
    })
  })

  it('supports multiple chats sessions by a buyer', function (nextSpec) {
    var buyerToSeller1
    var buyerToSeller2
    var sellerToBuyer1
    var sellerToBuyer2

    buyerToSeller1 = new Session(connection, globals.testerPrivateKey,
      new Buffer(globalsSession.sessionSecret1, 'hex'),
      {receiverAddr: globals.tester2PublicKey})

    buyerToSeller2 = new Session(connection, globals.testerPrivateKey,
      new Buffer(globalsSession.sessionSecret2, 'hex'),
      {receiverAddr: globals.tester3PublicKey})

    async.series([
      function (next) {
        buyerToSeller1.authenticate(next,
          new Buffer(globalsSession.der1, 'hex'))
      },
      function (next) {
        buyerToSeller2.authenticate(next,
          new Buffer(globalsSession.der2, 'hex'))
      },
      function (next) {
        Session.all(connection, globals.tester2PublicKey,
          function (err, sessions) {
            if (err) return next(err)

            expect(sessions.length).to.equal(1)

            sellerToBuyer1 = new Session(connection, globals.tester2PrivateKey,
              crypto.randomBytes(128), {withChat: sessions[0]})

            next()
          })
      },
      function (next) {
        Session.all(connection, globals.tester3PublicKey,
          function (err, sessions) {
            if (err) return next(err)

            expect(sessions.length).to.equal(1)

            sellerToBuyer2 = new Session(connection, globals.tester3PrivateKey,
              crypto.randomBytes(128), {withChat: sessions[0]})

            next()
          })
      },
      function (next) { sellerToBuyer1.authenticate(next) },
      function (next) { sellerToBuyer2.authenticate(next) },
      function (next) { buyerToSeller1.send('Hello Seller1', next) },
      function (next) { sellerToBuyer1.send('Hello from Seller1', next) },
      function (next) { buyerToSeller2.send('Hello Seller2', next) },
      function (next) { sellerToBuyer2.send('Hello from Seller2', next) }
    ], function (err, sessions) {
      if (err) throw err

      async.mapSeries([sellerToBuyer1, buyerToSeller1, sellerToBuyer2, buyerToSeller2],
        function (session, next) {
          session.getCommunications(function (err, chats) {
            if (err) throw err
            next(null, chats.map(getDecrypted))
          })
        },
        function (err, results) {
          if (err) throw err

          expect(results[0]).to.deep.equal([ 'Hello from Seller1',
            'Hello Seller1' ])
          expect(results[1]).to.deep.equal([ 'Hello from Seller1',
            'Hello Seller1' ])
          expect(results[2]).to.deep.equal([ 'Hello from Seller2',
            'Hello Seller2' ])
          expect(results[3]).to.deep.equal([ 'Hello from Seller2',
            'Hello Seller2' ])

          nextSpec()
        })
    })
  })

  it('supports multiple chat sessions between two users', function (nextSpec) {
    var buyerToSeller1
    var buyerToSeller2
    var sellerToBuyer1
    var sellerToBuyer2

    buyerToSeller1 = new Session(connection, globals.testerPrivateKey,
      new Buffer(globalsSession.sessionSecret1, 'hex'),
      {receiverAddr: globals.tester2PublicKey})

    async.series([
      function (next) {
        buyerToSeller1.authenticate(next,
          new Buffer(globalsSession.der1, 'hex'))
      },
      function (next) {
        Session.all(connection, globals.tester2PublicKey,
          function (err, sessions) {
            if (err) return next(err)

            expect(sessions.length).to.equal(1)

            sellerToBuyer1 = new Session(connection, globals.tester2PrivateKey,
              crypto.randomBytes(128), {withChat: sessions[0]})

            next()
          })
      },
      function (next) { sellerToBuyer1.authenticate(next) },
      function (next) { sellerToBuyer1.send('Hello Buyer S1', next) },
      function (next) { buyerToSeller1.send('Hello Seller S1', next) },
      // Now Create a Session 2:
      function (next) {
        connection.incrementBlockHeight()

        buyerToSeller2 = new Session(connection, globals.testerPrivateKey,
          new Buffer(globalsSession.sessionSecret2, 'hex'),
          {receiverAddr: globals.tester2PublicKey})

        next()
      },
      function (next) {
        buyerToSeller2.authenticate(next,
          new Buffer(globalsSession.der2, 'hex'))
      },
      function (next) {
        Session.all(connection, globals.tester2PublicKey,
          function (err, sessions) {
            if (err) return next(err)

            expect(sessions.length).to.equal(2)

            sellerToBuyer2 = new Session(connection, globals.tester2PrivateKey,
              crypto.randomBytes(128), {withChat: sessions[0]})

            next()
          })
      },
      function (next) {
        sellerToBuyer2.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err

          expect(isAuthenticated).to.be.false
          next()
        })
      },
      function (next) { sellerToBuyer2.authenticate(next) },
      function (next) {
        connection.incrementBlockHeight()

        Session.all(connection, globals.tester2PublicKey,
          function (err, sessions) {
            if (err) return next(err)

            expect(sessions.length).to.equal(2)

            next()
          })
      },
      // Authentication checks:
      function (next) {
        buyerToSeller2.getSymmKey(function (err, buyerToSeller2SymmKey) {
          if (err) throw err
          sellerToBuyer2.getSymmKey(function (err, sellerToBuyer2SymmKey) {
            if (err) throw err
            expect(buyerToSeller2SymmKey.toString('hex')).to.equal(
              sellerToBuyer2SymmKey.toString('hex'))
            next()
          })
        })
      },
      function (next) {
        buyerToSeller1.getSymmKey(function (err, buyerToSeller1SymmKey) {
          if (err) throw err
          sellerToBuyer2.getSymmKey(function (err, sellerToBuyer2SymmKey) {
            if (err) throw err
            expect(buyerToSeller1SymmKey.toString('hex')).to.not.equal(
              sellerToBuyer2SymmKey.toString('hex'))
            next()
          })
        })
      },
      function (next) {
        sellerToBuyer2.isAuthenticated(function (err, isAuthenticated) {
          if (err) throw err
          expect(isAuthenticated).to.be.true
          next()
        })
      },
      function (next) { sellerToBuyer2.send('Hello Buyer S2', next) },
      function (next) { buyerToSeller2.send('Hello Seller S2', next) }
    ], function (err, results) {
      if (err) throw err

      async.mapSeries([sellerToBuyer2, buyerToSeller2],
        function (session, next) {
          session.getCommunications(
          function (err, chats) {
            if (err) throw err
            next(null, chats.map(getDecrypted))
          })
        }, function (err, results) {
          if (err) throw err

          expect(results[0]).to.deep.equal([ 'Hello Seller S2',
            'Hello Buyer S2' ])
          expect(results[1]).to.deep.equal([ 'Hello Seller S2',
            'Hello Buyer S2' ])

          nextSpec()
        })
    })
  })
})
