/* global describe it before afterEach */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')

var drivers = require('../lib/drivers')
var messages = require('../lib/messages')
var profile = require('../lib/profile')
var globals = require('./fixtures/globals')

var async = require('async')

var expect = chai.expect
var Seller = messages.Seller

var SellerProfile = profile.SellerProfile

factories.dz(chai)

describe('SellerProfile', function () {
  var connection = null

  before(function (next) { connection = new drivers.FakeChain({
    blockHeight: messages.LATEST_VERSION_HEIGHT}, next) })
  afterEach(function (next) { connection.clearTransactions(next) })

  describe('accessors', function () {
    it('compiles a simple profile', function (nextSpec) {
      var profile = new SellerProfile(connection, globals.testerPublicKey)

      expect(profile.addr).to.equal(globals.testerPublicKey)

      async.series([
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        function (next) {
          profile.getAttributes(function (err, attrs) {
            if (err) throw err
            expect(attrs.validation).to.be.null
            expect(attrs.description).to.equal('abc')
            expect(attrs.alias).to.equal('Satoshi')
            expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(attrs.isActive).to.be.true
            next()
          })
        }
      ], nextSpec)
    })

    it('combines attributes from mulitple messages', function (nextSpec) {
      async.series([
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        function (next) {
          chai.factory.create('seller', connection,
            {description: 'xyz'}).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.testerPublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('xyz')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.isActive).to.be.true
              next()
            })
        }
      ], nextSpec)
    })

    it('supports profile transfers', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Seller Transfer to Tester2:
        function (next) {
          chai.factory.create('seller', connection, {
            transferAddr: globals.tester2PublicKey,
            receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Update Tester2 for some added complexity:
        function (next) {
          chai.factory.create('seller', connection, {
            alias: 'New Alias',
            receiverAddr: globals.tester2PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.tester2PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('New Alias')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.tester2PublicKey)
              expect(attrs.isActive).to.be.true
              next()
            })
        }
      ], nextSpec)
    })

    it('supports a transfer in and transfer out', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Seller Transfer to Tester2:
        function (next) {
          chai.factory.create('seller', connection, {
            transferAddr: globals.tester2PublicKey,
            receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Tester2 Transfer to Tester 3:
        function (next) {
          chai.factory.create('seller', connection, {
            transferAddr: globals.tester3PublicKey,
            receiverAddr: globals.tester3PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.tester3PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.tester3PublicKey)
              expect(attrs.isActive).to.be.true
              next()
            })
        }
      ], nextSpec)
    })

    it('only supports a single transfer in', function (nextSpec) {
      async.series([
        // Address 1 Declaration:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 2 Declaration:
        function (next) {
          new Seller(connection, {description: 'xyz', alias: 'New Alias',
           receiverAddr: globals.tester2PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        // Address 1 transfers to Address 3:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester3PublicKey,
           receiverAddr: globals.tester3PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Address 2 transfers to Address 3:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester3PublicKey,
           receiverAddr: globals.tester3PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.tester3PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.tester3PublicKey)
              expect(attrs.transferAddr).to.be.nil
              expect(attrs.isActive).to.be.true
              next()
            })
        }
      ], nextSpec)
    })

    it('supports deactivation', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Seller Deactivates his account:
        function (next) {
          new Seller(connection, {receiverAddr: globals.testerPublicKey,
            transferAddr: 0 }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.testerPublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.transferAddr).to.equal(0)
              expect(attrs.isActive).to.be.false
              expect(attrs.isClosed).to.be.true
              next()
            })
        }
      ], nextSpec)
    })

    it('will stop merging attributes after a transfer out', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 1 transfers to Address 2:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester2PublicKey,
           receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Address 1 changes description:
        function (next) {
          new Seller(connection, {
            description: 'xyz'
          }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.testerPublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.testerPublicKey)
              expect(attrs.transferAddr).to.equal(globals.tester2PublicKey)
              expect(attrs.isActive).to.be.false
              expect(attrs.isClosed).to.be.false
              next()
            })
        },
        function (next) {
          new SellerProfile(connection, globals.tester2PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.tester2PublicKey)
              expect(attrs.transferAddr).to.be.undefined
              expect(attrs.isActive).to.be.true
              expect(attrs.isClosed).to.be.false
              next()
            })
        }
      ], nextSpec)
    })

    it('will stop merging attributes after a cancellation', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 1 closes its account:
        function (next) {
          new Seller(connection, {transferAddr: 0,
           receiverAddr: globals.testerPublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Address changes description:
        function (next) {
          new Seller(connection, {description: 'xyz'}).save(
            globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.testerPublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.testerPublicKey)
              expect(attrs.transferAddr).to.equal(0)
              expect(attrs.isActive).to.be.false
              next()
            })
        }
      ], nextSpec)
    })

    it('will merge attributes in a cancellation message', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 1 closes its account:
        function (next) {
          new Seller(connection, {transferAddr: 0, description: 'xyz',
           receiverAddr: globals.testerPublicKey
          }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.testerPublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('xyz')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.testerPublicKey)
              expect(attrs.transferAddr).to.equal(0)
              expect(attrs.isActive).to.be.false
              next()
            })
        }
      ], nextSpec)
    })

    it('will merge attributes in a transfer message', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 1 closes its account:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester2PublicKey,
            description: 'xyz', receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.testerPublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('xyz')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.testerPublicKey)
              expect(attrs.transferAddr).to.equal(globals.tester2PublicKey)
              expect(attrs.isActive).to.be.false
              next()
            })
        }
      ], nextSpec)
    })
  })

  describe('validations', function () {
    it('won\'t compile a deactivated transfer', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 1 closes its account:
        function (next) {
          new Seller(connection, {transferAddr: 0,
            receiverAddr: globals.testerPublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Address 1 transfers its account:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester2PublicKey,
            receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.tester2PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation.errors.length).to.equal(1)
              expect(attrs.validation.errors[0].message).to.equal(
                'priorAttributes invalid transfer or closed')
              next()
            })
        }
      ], nextSpec)
    })

    it('requires a valid seller message', function (nextSpec) {
      new SellerProfile(connection, globals.tester2PublicKey).getAttributes(
        function (err, attrs) {
          if (err) throw err

          expect(attrs.validation.errors.length).to.equal(1)
          expect(attrs.validation.errors[0].message).to.equal(
            'profile not found')
          nextSpec()
        })
    })

    it('won\'t accept a second transfer out', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 1 transfers to address 2:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester2PublicKey,
            receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Address 1 transfers to address 3:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester3PublicKey,
            receiverAddr: globals.tester3PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          new SellerProfile(connection, globals.tester2PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation).to.be.null
              expect(attrs.description).to.equal('abc')
              expect(attrs.alias).to.equal('Satoshi')
              expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
              expect(attrs.addr).to.equal(globals.tester2PublicKey)
              expect(attrs.isActive).to.be.true

              next()
            })
        },
        function (next) {
          new SellerProfile(connection, globals.tester3PublicKey).getAttributes(
            function (err, attrs) {
              if (err) throw err

              expect(attrs.validation.errors.length).to.equal(1)
              expect(attrs.validation.errors[0].message).to.equal(
                'priorAttributes invalid transfer or closed')

              next()
            })
        }
      ], nextSpec)
    })
  })
})
