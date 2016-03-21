/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')
var async = require('async')

var extend = require('shallow-extend')
var drivers = require('../lib/drivers')
var messages = require('../lib/messages')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Payment = messages.Payment

factories.dz(chai)

describe('Payment', function () {
  var connection = null

  before(function (next) { connection = new drivers.FakeChain({
    blockHeight: messages.LATEST_VERSION_HEIGHT}, next) })
  after(function (next) { connection.clearTransactions(next) })

  it('has accessors', function () {
    // Note that this invoiceId was merely pulled from the ruby version
    var payment = chai.factory.create('payment', connection, {invoiceTxid: '02'})

    expect(payment.description).to.equal('abc')
    expect(payment.invoiceTxid).to.equal('02')
    expect(payment.deliveryQuality).to.equal(8)
    expect(payment.productQuality).to.equal(8)
    expect(payment.communicationsQuality).to.equal(8)
    expect(payment.receiverAddr).to.equal(globals.tester2PublicKey)
    expect(payment.senderAddr).to.not.exist
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('payment', connection,
      {invoiceTxid: '02'}).toTransaction()).to.eql(
      { tip: 40000, receiverAddr: globals.tester2PublicKey,
        data: new Buffer([73, 78, 80, 65, 73, 68, 1, 100, 3, 97, 98, 99, 1, 116,
          1, 2, 1, 113, 8, 1, 112, 8, 1, 99, 8]) })
  })

  describe('#save() and #find()', function () {
    it('persists and loads', function (next) {
      chai.factory.create('payment', connection,
        {invoiceTxid: '02'}).save(globals.testerPrivateKey,
        function (err, createPayment) {
          if (err) throw err

          expect(createPayment.description).to.equal('abc')
          expect(createPayment.invoiceTxid).to.equal('02')
          expect(createPayment.deliveryQuality).to.equal(8)
          expect(createPayment.productQuality).to.equal(8)
          expect(createPayment.communicationsQuality).to.equal(8)
          expect(createPayment.receiverAddr).to.equal(globals.tester2PublicKey)
          expect(createPayment.senderAddr).to.equal(globals.testerPublicKey)

          Payment.find(connection, createPayment.txid,
            function (err, findPayment) {
              if (err) throw err

              expect(findPayment.description).to.equal('abc')
              expect(findPayment.invoiceTxid).to.equal('02')
              expect(findPayment.deliveryQuality).to.equal(8)
              expect(findPayment.productQuality).to.equal(8)
              expect(findPayment.communicationsQuality).to.equal(8)
              expect(findPayment.receiverAddr).to.equal(globals.tester2PublicKey)
              expect(createPayment.senderAddr).to.equal(globals.testerPublicKey)
              next()
            })
        })
    })
  })

  describe('associations', function () {
    it('has_one invoice', function (nextSpec) {
      async.waterfall([
        function (next) {
          // Create an Invoice
          chai.factory.create('invoice', connection,
            {receiverAddr: globals.testerPublicKey})
            .save(globals.testerPrivateKey, next)
        },
        function (invoice, next) {
          // Create Payment one:
          var paymentAttrs = { invoiceTxid: invoice.txid,
            receiverAddr: globals.testerPublicKey, description: 'xyz' }

          chai.factory.create('payment', connection, paymentAttrs)
            .save(globals.tester2PrivateKey, next)
        },
        function (payment, next) {
          // Get Invoice
          payment.getInvoice(next)
        }
      ], function (err, invoice) {
        if (err) throw err

        expect(invoice.expirationIn).to.equal(6)
        expect(invoice.amountDue).to.equal(100000000)
        expect(invoice.receiverAddr).to.equal(globals.testerPublicKey)

        nextSpec()
      })
    })
  })

  describe('validations', function () {
    it('validates default build', function (next) {
      factories.createPayment(chai, connection, null, function (err, payment) {
        if (err) throw err
        payment.isValid(function (err, res) {
          if (err) throw err
          expect(res).to.be.null
          next()
        })
      })
    })

    it('validates minimal payment', function (nextSpec) {
      async.waterfall([
        function (next) {
          chai.factory.create('invoice', connection,
            {receiverAddr: globals.testerPublicKey})
            .save(globals.tester2PrivateKey, next)
        }],
        function (err, invoice) {
          if (err) throw err
          var payment = new Payment(connection,
            {receiverAddr: globals.tester2PublicKey, invoiceTxid: invoice.txid})

          payment.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
            nextSpec()
          })
        })
    })

    it('validates output address must be present', function (next) {
      factories.createPayment(chai, connection, {receiverAddr: undefined},
        function (err, payment) {
          if (err) throw err
          payment.isValid(function (err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(2)
            expect(res.errors[0].message).to.equal('receiverAddr is required')
            expect(res.errors[1].message).to.equal('invoiceTxid can\'t be found')

            next()
          })
        })
    })

    it('description must be string', function (next) {
      factories.createPayment(chai, connection, {description: 1},
        function (err, payment) {
          if (err) throw err

          payment.isValid(function (err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(1)
            expect(res.errors[0].message).to.equal('description is not a string')

            next()
          })
        })
    })

    it('invoiceTxid must be string', function (next) {
      var payment = chai.factory.create('payment', connection, {invoiceTxid: 1})

      payment.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(2)
        expect(res.errors[0].message).to.equal('invoiceTxid is not a string')
        expect(res.errors[1].message).to.equal('invoiceTxid can\'t be found')

        next()
      })
    })

    async.each(['deliveryQuality', 'productQuality', 'communicationsQuality'],
      function (attr, nextAttr) {
        it(attr + ' must be numeric', function (next) {
          var attrs = {}
          attrs[attr] = 'abc'

          factories.createPayment(chai, connection, attrs,
            function (err, payment) {
              if (err) throw err

              payment.isValid(function (err, res) {
                if (err) throw err

                expect(res.errors.length).to.equal(1)
                expect(res.errors[0].message).to.equal(
                  attr + ' is not an integer')

                next()
              })
            })
        })

        it(attr + ' must be lte 8', function (next) {
          var attrs = {}
          attrs[attr] = 9

          chai.factory.create('payment', connection, attrs)

          factories.createPayment(chai, connection, attrs,
            function (err, payment) {
              if (err) throw err

              payment.isValid(function (err, res) {
                if (err) throw err

                expect(res.errors.length).to.equal(1)
                expect(res.errors[0].message).to.equal(
                  attr + ' must be between 0 and 8')

                next()
              })
            })
        })

        it(attr + ' must be gte 0', function (next) {
          var attrs = {}
          attrs[attr] = -1

          factories.createPayment(chai, connection, attrs,
            function (err, payment) {
              if (err) throw err

              payment.isValid(function (err, res) {
                if (err) throw err

                expect(res.errors.length).to.equal(1)
                expect(res.errors[0].message).to.equal(
                  attr + ' must be between 0 and 8')

                next()
              })
            })
        })

        nextAttr()
      })

    it('declaration must not be addressed to self', function (next) {
      factories.createPayment(chai, connection,
        {receiverAddr: globals.testerPublicKey},
        function (err, payment) {
          if (err) throw err

          payment.save(globals.testerPrivateKey, function (err, createPayment) {
            if (err) throw err

            Payment.find(connection, createPayment.txid,
              function (err, findPayment) {
                if (err) throw err

                findPayment.isValid(function (err, res) {
                  if (err) throw err

                  expect(res.errors.length).to.equal(2)
                  expect(res.errors[0].message).to.equal(
                    'receiverAddr matches senderAddr')
                  expect(res.errors[1].message).to.equal(
                    'invoiceTxid can\'t be found')

                  next()
                })
              })
          })
        })
    })

    it('must be addressed to transactionId owner', function (nextSpec) {
      async.waterfall([
        function (next) {
          chai.factory.create('invoice', connection,
            {receiverAddr: globals.testerPublicKey})
            .save(globals.tester2PrivateKey, next)
        }, function (invoice, next) {
          new Payment(connection, {receiverAddr: globals.testerPublicKey,
            invoiceTxid: invoice.txid}).save(globals.tester3PrivateKey, next)
        }],
        function (err, payment) {
          if (err) throw err

          payment.isValid(function (err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(1)
            expect(res.errors[0].message).to.equal(
              'invoiceTxid can\'t be found')

            nextSpec()
          })
        })
    })

    it('validates invoice existence', function (nextSpec) {
      var payment = chai.factory.create('payment', connection,
        {invoiceTxid: 'non-existant-id'})

      payment.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal('invoiceTxid can\'t be found')

        nextSpec()
      })
    })
  })

  describe('versioning', function () {
    var JUNSETH_PAYMENT_ATTRS = { communicationsQuality: 8,
      receiverAddr: 'mjW8kesgoKAswSEC8dGXa7c3qVa5ixiG4M',
      description: 
        "Good communication with seller. Fast to create invoice. Looking "+
        "forward to getting hat. A+++ Seller",
      invoiceTxid: 
        "e5a564d54ab9de50fc6eba4176991b7eb8f84bbeca3482ca032c12c1c0050ae3"}

    it('encodes v0 payments with string transaction ids', function () {
      var blockHeight = 389557

      var payment = new Payment(connection, extend(JUNSETH_PAYMENT_ATTRS,
        {blockHeight: blockHeight}))

      var data = payment.toTransaction().data

      expect(data.toString('utf8', 0, 6)).to.equal('INPAID')
      expect(data.toString('utf8', 6, 9)).to.equal("\u0001dc")
      expect(data.toString('utf8', 9, 108)).to.equal(
        JUNSETH_PAYMENT_ATTRS.description)

      // This was the problem (at 64 bytes instead of 32): 
      expect(data.toString('utf8', 108, 111)).to.equal("\u0001t@")
      expect(data.toString('utf8', 111, 175)).to.equal(
        JUNSETH_PAYMENT_ATTRS.invoiceTxid)

      expect(data.toString('utf8', 175, data.length)).to.equal("\u0001c\b")

      //  Now decode this payment:
      var payment = new Payment(connection, {data: data, 
        blockHeight: blockHeight, 
        receiverAddr: JUNSETH_PAYMENT_ATTRS.receiverAddr})

      expect(payment.description).to.equal(JUNSETH_PAYMENT_ATTRS.description)
      expect(payment.invoiceTxid).to.equal(JUNSETH_PAYMENT_ATTRS.invoiceTxid)
      expect(payment.receiverAddr).to.equal(JUNSETH_PAYMENT_ATTRS.receiverAddr)
    })

    it('encodes v1 payments with string transaction ids', function () {
      var payment = new Payment(connection, JUNSETH_PAYMENT_ATTRS)

      var data = payment.toTransaction().data

      expect(data.toString('utf8', 0, 6)).to.equal('INPAID')
      expect(data.toString('utf8', 6, 9)).to.equal("\u0001dc")
      expect(data.toString('utf8', 9, 108)).to.equal(
        JUNSETH_PAYMENT_ATTRS.description)

      // This was the problem (at 64 bytes instead of 32): 
      expect(data.toString('utf8', 108, 111)).to.equal("\u0001t ")
      expect(data.toString('hex', 111, 143)).to.equal(
        JUNSETH_PAYMENT_ATTRS.invoiceTxid)

      expect(data.toString('utf8', 143, data.length)).to.equal("\u0001c\b")

      //  Now decode this payment:
      var payment = new Payment(connection, {data: data, 
        receiverAddr: JUNSETH_PAYMENT_ATTRS.receiverAddr})

      expect(payment.description).to.equal(JUNSETH_PAYMENT_ATTRS.description)
      expect(payment.invoiceTxid).to.equal(JUNSETH_PAYMENT_ATTRS.invoiceTxid)
      expect(payment.receiverAddr).to.equal(JUNSETH_PAYMENT_ATTRS.receiverAddr)
    })
  })
})
