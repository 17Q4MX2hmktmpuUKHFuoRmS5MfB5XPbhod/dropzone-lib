/* global describe it */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')
var _ = require('lodash')
var util = require('util')

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
    var payment = chai.factory.create('payment', connection)

// TODO
    expect(payment.expirationIn).to.equal(6)
    expect(payment.amountDue).to.equal(100000000)
    expect(payment.receiverAddr).to.equal(globals.testerPublicKey)
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('payment', connection).toTransaction()).to.eql(
      { tip: 20000, receiverAddr: globals.testerPublicKey, 
        // TODO: data: "".force_encoding('ASCII-8BIT')
        data: new Buffer([ ]) }) 
  })

  describe("#save() and #find()", function() {

  })
/*
  describe "defaults" do
    it "has accessors" do
      payment = Dropzone::Payment.sham!(:build)

      expect(payment.description).to eq("abc")
      expect(payment.invoice_txid).to be_kind_of(String)
      expect(payment.delivery_quality).to eq(8)
      expect(payment.product_quality).to eq(8)
      expect(payment.communications_quality).to eq(8)
      expect(payment.receiver_addr).to eq(TESTER2_PUBLIC_KEY)
      expect(payment.sender_addr).to eq(nil)
    end
  end

  describe "serialization" do 
    it "serializes to_transaction" do
      expect(Dropzone::Payment.sham!(invoice_txid: '2').to_transaction).to eq({
        tip: 20000, receiver_addr: TESTER2_PUBLIC_KEY, 
        data: "INPAID\u0001d\u0003abc\u0001t\u00012\u0001q\b\u0001p\b\u0001c\b".force_encoding('ASCII-8BIT') })
    end
  end

  describe "database" do
    after{ clear_blockchain! }

    it ".save() and .find()" do
      payment_id = Dropzone::Payment.sham!(:build).save! test_privkey
      expect(payment_id).to be_kind_of(String)

      payment = Dropzone::Payment.find payment_id

      expect(payment.description).to eq("abc")
      expect(payment.invoice_txid).to be_kind_of(String)
      expect(payment.delivery_quality).to eq(8)
      expect(payment.product_quality).to eq(8)
      expect(payment.communications_quality).to eq(8)
      expect(payment.receiver_addr).to eq(TESTER2_PUBLIC_KEY)
      expect(payment.sender_addr).to eq(test_pubkey)
    end
  end

  describe "associations" do
    it "has_one invoice" do 
      payment_id = Dropzone::Payment.sham!(:build).save! test_privkey

      payment = Dropzone::Payment.find payment_id
      expect(payment.invoice.expiration_in).to eq(6)
      expect(payment.invoice.amount_due).to eq(100_000_000)
      expect(payment.invoice.receiver_addr).to eq(test_pubkey)
    end
  end

  describe "validations" do 
    after{ clear_blockchain! }

    it "validates default build" do
      expect(Dropzone::Payment.sham!(:build).valid?).to eq(true)
    end

    it "validates minimal payment" do
      invoice_id = Dropzone::Invoice.sham!(:build).save! TESTER2_PRIVATE_KEY

      payment = Dropzone::Payment.new receiver_addr: TESTER2_PUBLIC_KEY, 
        invoice_txid: invoice_id

      expect(payment.valid?).to eq(true)
    end

    it "validates output address must be present" do
      payment = Dropzone::Payment.sham! receiver_addr: nil

      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(2)
      expect(payment.errors.on(:receiver_addr)).to eq(['is not present'])
      expect(payment.errors.on(:invoice_txid)).to eq(["can't be found"])
    end

    it "description must be string" do
      payment = Dropzone::Payment.sham! description: 1

      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(1)
      expect(payment.errors.on(:description)).to eq(['is not a string'])
    end

    it "invoice_txid must be string" do
      payment = Dropzone::Payment.sham! invoice_txid: 500

      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(2)
      expect(payment.errors.on(:invoice_txid)).to eq(['is not a string', 
        "can't be found"])
    end
    
    [:delivery_quality,:product_quality,:communications_quality ].each do |rating_attr|
      it "%s must be numeric" % rating_attr.to_s do
        payment = Dropzone::Payment.sham! rating_attr => 'abc'

        expect(payment.valid?).to eq(false)
        expect(payment.errors.count).to eq(2)
        expect(payment.errors.on(rating_attr)).to eq(
          ['is not a number', "is not in set: 0..8"])
      end

      it "%s must be between 0 and 8" % rating_attr.to_s do
        payment = Dropzone::Payment.sham! rating_attr => 9

        expect(payment.valid?).to eq(false)
        expect(payment.errors.count).to eq(1)
        expect(payment.errors.on(rating_attr)).to eq(['is not in set: 0..8'])
      end
    end

    it "validates invoice existence" do
      payment = Dropzone::Payment.sham! invoice_txid: 'non-existant-id'
      
      expect(payment.valid?).to eq(false)
      expect(payment.errors.count).to eq(1)
      expect(payment.errors.on(:invoice_txid)).to eq(["can't be found"])
    end

    it "declaration must not be addressed to self" do
      id = Dropzone::Invoice.sham!(receiver_addr: test_pubkey).save! test_privkey

      invoice = Dropzone::Invoice.find id

      expect(invoice.valid?).to eq(false)
      expect(invoice.errors.count).to eq(1)
      expect(invoice.errors.on(:receiver_addr)).to eq(['matches sender_addr'])
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
