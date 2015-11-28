/* global describe it */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')
var _ = require('lodash')
var util = require('util')
var async = require('async')

var fakeConnection = require('../lib/drivers/fake')

var payment = require('../lib/payment')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Payment = payment.Payment

factories.dz(chai)

describe('Payment', function () {
  var connection = null

  before(function(next) {
    connection = new fakeConnection.FakeBitcoinConnection(function(err) {
      if (err) throw err
      next()
    })
  })

  after(function(next) {
    connection.clearTransactions(function(err) {
      if (err) throw err
      next()
    })
  })

  it('has accessors', function () {
    // Note that this invoiceId was merely pulled from the ruby version
    var payment = chai.factory.create('payment', connection, {invoiceTxid: '2'})

    expect(payment.description).to.equal("abc")
    expect(payment.invoiceTxid).to.equal("2")
    expect(payment.deliveryQuality).to.equal(8)
    expect(payment.productQuality).to.equal(8)
    expect(payment.communicationsQuality).to.equal(8)
    expect(payment.receiverAddr).to.equal(globals.tester2PublicKey)
    expect(payment.senderAddr).to.not.exist
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('payment', connection, 
      {invoiceTxid: '2'}).toTransaction()).to.eql(
      { tip: 40000, receiverAddr: globals.tester2PublicKey, 
        data: new Buffer([73, 78, 80, 65, 73, 68, 1, 100, 3, 97, 98, 99, 
          1, 116, 1, 50, 1, 113, 8, 1, 112, 8, 1, 99, 8]) }) 
  })

  describe("#save() and #find()", function() {
    it('persists and loads', function (next) {
      chai.factory.create('payment', connection, 
        {invoiceTxid: '2'}).save(globals.testerPrivateKey, 
        function(err, createPayment) {
          if (err) throw err

          expect(createPayment.description).to.equal("abc")
          expect(createPayment.invoiceTxid).to.equal("2")
          expect(createPayment.deliveryQuality).to.equal(8)
          expect(createPayment.productQuality).to.equal(8)
          expect(createPayment.communicationsQuality).to.equal(8)
          expect(createPayment.receiverAddr).to.equal(globals.tester2PublicKey)
          expect(createPayment.senderAddr).to.equal(globals.testerPublicKey)

          Payment.find(connection, createPayment.txid, 
            function(err, findPayment) {
            if (err) throw err

            expect(findPayment.description).to.equal("abc")
            expect(findPayment.invoiceTxid).to.equal("2")
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

  describe("associations", function() {
    it("has_one invoice", function(nextSpec) {
      async.waterfall([
          function(next){
            // Create an Invoice
            chai.factory.create('invoice', connection, 
              {receiverAddr: globals.testerPublicKey} )
              .save(globals.testerPrivateKey, next)
          },
          function(invoice, next){
            // Create Payment one:
            var paymentAttrs = { invoiceTxid: invoice.txid, 
              receiverAddr: globals.testerPublicKey, description: 'xyz' }

            chai.factory.create('payment', connection, paymentAttrs)
              .save(globals.tester2PrivateKey, next)
          },
          function(payment, next) {
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

  describe("validations", function() {
    it("validates default build", function(next) {
      var payment = chai.factory.create('payment', connection)

      payment.isValid(function(err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it("validates minimal payment", function(nextSpec) {
      async.waterfall([
        function(next){
          chai.factory.create('invoice', connection, 
            {receiverAddr: globals.tester2PublicKey} )
            .save(globals.testerPrivateKey, next)
        }], function (err, invoice) {
          if (err) throw err
          var payment = new Payment( connection, 
            {receiverAddr: globals.testerPublicKey, invoiceTxid: invoice.txid})

          payment.isValid(function(err, res) {
            if (err) throw err
            expect(res).to.be.null
            nextSpec()
          })
      })
    })

    it("validates output address must be present", function(next) {
      var payment = chai.factory.create('payment', connection, 
        {receiverAddr: undefined})

      payment.isValid(function(err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          "receiverAddr is required")

        next()
      })
    })

    it("description must be string", function(next) {
      var payment = chai.factory.create('payment', connection, 
        {description: 1})

      payment.isValid(function(err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          "description is not a string")

        next()
      })
    })

    it("invoiceTxid must be string", function(next) {
      var payment = chai.factory.create('payment', connection, 
        {invoiceTxid: 1})

      payment.isValid(function(err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          "invoiceTxid is not a string")

        next()
      })
    })

    async.each(['deliveryQuality','productQuality','communicationsQuality'], 
      function(attr, nextAttr) { 
        it(attr+" must be numeric", function(next) {
          attrs = {}
          attrs[attr] = 'abc'

          var payment = chai.factory.create('payment', connection, attrs)

          payment.isValid(function(err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(1)
            expect(res.errors[0].message).to.equal(
              attr+" is not an integer")

            next()
          })
        })

        it(attr+" must be lte 8", function(next) {
          attrs = {}
          attrs[attr] = 9

          var payment = chai.factory.create('payment', connection, attrs)

          payment.isValid(function(err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(1)
            expect(res.errors[0].message).to.equal(
              attr+" must be between 0 and 8")

            next()
          })

        })

        it(attr+" must be gte 0", function(next) {
          attrs = {}
          attrs[attr] = -1

          var payment = chai.factory.create('payment', connection, attrs)

          payment.isValid(function(err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(1)
            expect(res.errors[0].message).to.equal(
              attr+" must be between 0 and 8")

            next()
          })
        })

        nextAttr()
      })

    it("declaration must not be addressed to self", function(next) {
      chai.factory.create('payment', connection, 
        {receiverAddr: globals.testerPublicKey}).save(globals.testerPrivateKey,
        function(err, createPayment) {
          if (err) throw err

          Payment.find(connection, createPayment.txid, 
            function(err, findPayment) {
            if (err) throw err

            findPayment.isValid(function(err, res) {
              if (err) throw err

              expect(res.errors.length).to.equal(1)
              expect(res.errors[0].message).to.equal(
                "receiverAddr matches senderAddr")

              next()
            })
          })
      })
    })

    it("must be addressed to transactionId owner", function(nextSpec) {
      async.waterfall([
        function(next){
          chai.factory.create('invoice', connection, 
            {receiverAddr: globals.tester2PublicKey} )
            .save(globals.testerPrivateKey, next)
        }, function (invoice,next) {
          new Payment( connection, {receiverAddr: globals.testerPublicKey, 
            invoiceTxid: invoice.txid}).save(globals.tester3PrivateKey, next)
        }], function (err, payment) {
          if (err) throw err

          payment.isValid(function(err, res) {
            if (err) throw err

            expect(res.errors.length).to.equal(1)
            expect(res.errors[0].message).to.equal(
              "invoiceTxid cannot be found")

            next()
          })
        })
      })

  
    it("validates invoice existence", function(nextSpec) {
/* TODO:
    it "validates invoice existence" do
      payment = Dropzone::Payment.sham! invoice_txid: 'non-existant-id'
      
      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(1)
      expect(payment.errors.on(:invoice_txid)).to eq(["can't be found"])
    end
*/
      expect(true).to.equal(false)
      nextSpec()
    })
  })

})
