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
        function(err, create_payment) {

        expect(create_payment.description).to.equal("abc")
        expect(create_payment.invoiceTxid).to.equal("2")
        expect(create_payment.deliveryQuality).to.equal(8)
        expect(create_payment.productQuality).to.equal(8)
        expect(create_payment.communicationsQuality).to.equal(8)
        expect(create_payment.receiverAddr).to.equal(globals.tester2PublicKey)
        expect(create_payment.senderAddr).to.equal(globals.testerPublicKey)

        Payment.find(connection, create_payment.txid, function(err, find_payment) {

          expect(find_payment.description).to.equal("abc")
          expect(find_payment.invoiceTxid).to.equal("2")
          expect(find_payment.deliveryQuality).to.equal(8)
          expect(find_payment.productQuality).to.equal(8)
          expect(find_payment.communicationsQuality).to.equal(8)
          expect(find_payment.receiverAddr).to.equal(globals.tester2PublicKey)
          expect(create_payment.senderAddr).to.equal(globals.testerPublicKey)
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
              {receiverAddr: globals.tester2PublicKey} )
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
            expect(payment.invoice.expirationIn).to.equal(6)
            expect(payment.invoice.amountDue).to.equal(100000000)
            expect(payment.invoice.receiverAddr).to.equal(globals.testerPublicKey)

            nextSpec()
        })
      })
    })

  describe("validations", function() {
    it("validates default build", function(next) {
      var payment = chai.factory.create('payment', connection)

      payment.isValid(function(count, errors) {
        expect(count).to.equal(0)
        expect(errors).to.be.empty
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
          var payment = new Payment( connection, 
            {receiverAddr: globals.testerPublicKey, invoiceTxid: invoice.txid})

          payment.isValid(function(count, errors) {
            expect(count).to.equal(0)
            expect(errors).to.be.empty
            nextSpec()
          })
      })
    })

    it("validates output address must be present", function(next) {
      var payment = chai.factory.create('payment', connection, 
        {receiverAddr: null})

      payment.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ 
          {parameter: 'receiverAddr', value: undefined, 
            message: 'Required value.'} ])

        next()
      })
    })

    it("description must be string", function(next) {
      var payment = chai.factory.create('payment', connection, 
        {description: 1})

      payment.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ 
          {parameter: 'description', value: 1, 
            message: 'Incorrect type. Expected string.'},
          ])

        next()
      })
    })

    it("invoiceTxid must be string", function(next) {
      var payment = chai.factory.create('payment', connection, 
        {invoiceTxid: 1})

      payment.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ 
          {parameter: 'invoiceTxid', value: 1, 
            message: 'Incorrect type. Expected string.'},
          ])

        next()
      })
    })

    async.each(['deliveryQuality','productQuality','communicationsQuality'], 
      function(attr, nextAttr) { 
        it(attr+" must be numeric", function(next) {
          attrs = {}
          attrs[attr] = 'abc'

          var payment = chai.factory.create('payment', connection, attrs)

          payment.isValid(function(count, errors) {
            expect(count).to.equal(1)
            expect(errors).to.deep.equal([ 
              {parameter: attr, value: 'abc', 
                message: 'Incorrect type. Expected number.'},
              ])

            next()
          })
        })

        it(attr+" must be lte 8", function(next) {
          attrs = {}
          attrs[attr] = 8.1

          var payment = chai.factory.create('payment', connection, attrs)

          payment.isValid(function(count, errors) {
            expect(count).to.equal(1)
            expect(errors).to.deep.equal([ 
              {parameter: attr, value: 8.1, 
                message: 'Value must be less than or equal to 8.'},
              ])

            next()
          })
        })

        it(attr+" must be gt 8", function(next) {
          attrs = {}
          attrs[attr] = -1

          var payment = chai.factory.create('payment', connection, attrs)

          payment.isValid(function(count, errors) {
            expect(count).to.equal(1)
            expect(errors).to.deep.equal([ 
              {parameter: attr, value: -1, 
                message: 'Value must be greater than or equal to 0.'},
              ])

            next()
          })
        })

        nextAttr()
      })

    it("declaration must not be addressed to self", function(next) {
      chai.factory.create('payment', connection, 
        {receiverAddr: globals.testerPublicKey}).save(globals.testerPrivateKey,
        function(err, create_payment) {

        Payment.find(connection, create_payment.txid, function(err, find_payment) {
          find_payment.isValid(function(count, errors) {
            expect(count).to.equal(1)
            expect(errors).to.deep.equal([ {parameter: 'receiverAddr',
              value: globals.testerPublicKey, message: 'matches senderAddr'} ])

            next()
          })
        })
      })
    })





  
/* TODO:
 
    it "validates invoice existence" do
      payment = Dropzone::Payment.sham! invoice_txid: 'non-existant-id'
      
      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(1)
      expect(payment.errors.on(:invoice_txid)).to eq(["can't be found"])
    end

    it "must be addressed to transaction_id owner" do
      # The sham'd Invoice is addressed to TESTER2_PUBLIC_KEY
      payment_id = Dropzone::Payment.sham!(
        receiver_addr: TESTER_PUBLIC_KEY).save! TESTER3_PRIVATE_KEY

      payment = Dropzone::Payment.find payment_id

      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(1)
      expect(payment.errors.on(:invoice_txid)).to eq(["can't be found"])
    end

  end
*/
  })

})
