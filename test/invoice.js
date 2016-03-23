/* global describe it before after*/
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')
var async = require('async')

var drivers = require('../lib/drivers')
var messages = require('../lib/messages')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Invoice = messages.Invoice

factories.dz(chai)

describe('Invoice', function () {
  var connection = null

  before(function (next) {
    connection = new drivers.FakeChain({
      blockHeight: messages.LATEST_VERSION_HEIGHT}, next)
  })
  after(function (next) { connection.clearTransactions(next) })

  it('has accessors', function () {
    var invoice = chai.factory.create('invoice', connection)

    expect(invoice.expirationIn).to.equal(6)
    expect(invoice.amountDue).to.equal(100000000)
    expect(invoice.receiverAddr).to.equal(globals.testerPublicKey)
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('invoice', connection).toTransaction()).to.eql(
      { tip: 40000, receiverAddr: globals.testerPublicKey,
        data: new Buffer([73, 78, 67, 82, 84, 69, 1, 112, 254, 0, 225, 245, 5,
          1, 101, 6 ]) })
  })

  describe('#save() and #find()', function () {
    it('persists and loads', function (next) {
      chai.factory.create('invoice', connection).save(globals.testerPrivateKey,
        function (err, createInvoice) {
          if (err) throw err

          expect(createInvoice.expirationIn).to.equal(6)
          expect(createInvoice.amountDue).to.equal(100000000)
          expect(createInvoice.receiverAddr).to.equal(globals.testerPublicKey)
          expect(createInvoice.senderAddr).to.equal(globals.testerPublicKey)

          Invoice.find(connection, createInvoice.txid, function (err, findInvoice) {
            if (err) throw err
            expect(findInvoice.expirationIn).to.equal(6)
            expect(findInvoice.amountDue).to.equal(100000000)
            expect(findInvoice.receiverAddr).to.equal(globals.testerPublicKey)
            expect(findInvoice.senderAddr).to.equal(globals.testerPublicKey)

            next()
          })
        })
    })
  })

  describe('associations', function () {
    it('has_many payments', function (nextSpec) {
      async.waterfall([
        function (next) {
          // Create an Invoice
          chai.factory.create('invoice', connection,
            {receiverAddr: globals.tester2PublicKey})
            .save(globals.testerPrivateKey, next)
        },
        function (invoice, next) {
          // Create Payment one:
          var paymentAttrs = { invoiceTxid: invoice.txid,
            receiverAddr: globals.testerPublicKey, description: 'abc' }

          chai.factory.create('payment', connection, paymentAttrs)
            .save(globals.tester2PrivateKey, function (err, payment) {
              if (err) throw err
              next(null, invoice)
            })
        },
        function (invoice, next) {
          // Increment Block Height
          connection.incrementBlockHeight()
          next(null, invoice)
        },
        function (invoice, next) {
          // Create Payment two:
          var paymentAttrs = { invoiceTxid: invoice.txid,
            receiverAddr: globals.testerPublicKey, description: 'xyz' }

          chai.factory.create('payment', connection, paymentAttrs)
            .save(globals.tester2PrivateKey, function (err, payment) {
              if (err) throw err
              next(null, invoice)
            })
        },
        function (invoice, next) {
          // Load the Payments:
          invoice.getPayments(next)
        }],
        function (err, payments) {
          if (err) throw err

          var descriptions = payments.map(function (p) { return p.description })

          expect(payments.length).to.equal(2)
          expect(descriptions).to.deep.equal(['xyz', 'abc'])
          nextSpec()
        })
    })
  })

  describe('validations', function () {
    it('validates default build', function (next) {
      var invoice = chai.factory.create('invoice', connection)

      invoice.isValid(function (err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it('validates minimal invoice', function (next) {
      var invoice = new Invoice(connection,
        {receiverAddr: globals.testerPublicKey})

      invoice.isValid(function (err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it('expirationIn must be numeric', function (next) {
      var invoice = chai.factory.create('invoice', connection,
        {expirationIn: 'abc'})

      invoice.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'expirationIn is not an integer')

        next()
      })
    })

    it('expirationIn must gt 0', function (next) {
      var invoice = chai.factory.create('invoice', connection,
        {expirationIn: -1})

      invoice.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'expirationIn cannot be less than 0')

        next()
      })
    })

    it('amountDue must be numeric', function (next) {
      var invoice = chai.factory.create('invoice', connection,
        {amountDue: 'abc'})

      invoice.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'amountDue is not an integer')

        next()
      })
    })

    it('amountDue must gt 0', function (next) {
      var invoice = chai.factory.create('invoice', connection,
        {amountDue: -1})

      invoice.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'amountDue cannot be less than 0')

        next()
      })
    })

    it('validates output address must be present', function (next) {
      var invoice = chai.factory.create('invoice', connection,
        {receiverAddr: undefined})

      invoice.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'receiverAddr is required')

        next()
      })
    })

    it('declaration must not be addressed to self', function (next) {
      chai.factory.create('invoice', connection,
        {receiverAddr: globals.testerPublicKey}).save(globals.testerPrivateKey,
        function (err, createInvoice) {
          if (err) throw err

          Invoice.find(connection, createInvoice.txid,
            function (err, findInvoice) {
              if (err) throw err

              findInvoice.isValid(function (err, res) {
                if (err) throw err

                expect(res.errors.length).to.equal(1)
                expect(res.errors[0].message).to.equal(
                  'receiverAddr matches senderAddr')

                next()
              })
            })
        })
    })
  })
})
