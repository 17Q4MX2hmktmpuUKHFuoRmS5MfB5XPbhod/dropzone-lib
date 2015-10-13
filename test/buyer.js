/* global describe it */
/* eslint no-new: 0 */

var chai = require('chai')
var chaiJsFactories = require('chai-js-factories')
var _ = require('lodash')

var fakeConnection = require('../test/src/fake_connection')
var buyer = require('../src/buyer')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Buyer = buyer.Buyer

var connection = new fakeConnection.FakeBitcoinConnection()

chai.use(chaiJsFactories)
chai.factory.define('buyer', function (args) {
  var basic = {
    description: "abc", alias: "Satoshi", 
    receiver_addr: globals.tester_public_key
  }
  return new Buyer(connection, _.extend(basic, args))
})

describe('Buyer', function () {
  after(function() {
    connection.clearTransactions()
  })

  it('has accessors', function () {
    var buyer = chai.factory.create('buyer')

    expect(buyer.description).to.equal("abc")
    expect(buyer.alias).to.equal("Satoshi")
    expect(buyer.transfer_pkey).to.not.exist
    expect(buyer.receiver_addr).to.equal(globals.tester_public_key)
    expect(buyer.sender_addr).to.not.exist
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('buyer').toTransaction()).to.eql(
      { tip: 20000, receiver_addr: globals.tester_public_key, 
        data: new Buffer([66, 89, 85, 80, 68, 84, 1, 100, 3, 97, 98, 99, 1, 97,
          7, 83, 97, 116, 111, 115, 104, 105]) })
  })

  describe("#save() and #find()", function() {
    it('persists and loads', function () {
      var buyer_txid = chai.factory.create('buyer').save(globals.tester_private_key)
      expect(buyer_txid).to.be.a('string')

      var buyer = Buyer.find(buyer_txid)

      expect(buyer.description).to.equal("abc")
      expect(buyer.alias).to.equal("Satoshi")
      expect(buyer.transfer_pkey).to.not.exist
      expect(buyer.receiver_addr).to.equal(globals.tester_public_key)
      expect(buyer.sender_addr).to.equal(globals.tester_public_key)
    })

  })

  describe("validations", function() {
    it("validates default build", function() {
      expect(chai.factory.create('buyer').isValid()).to.be.true
    })

    it("validates minimal buyer", function() {
      var buyer = new Buyer( connection, 
        {receiver_addr: globals.tester_public_key})

      expect(buyer.isValid()).to.be.true
    })

    it("validates output address must be present", function() {
      var buyer = chai.factory.create('buyer', {receiver_addr: nil})

      expect(buyer.isValid()).to.be.false
      expect(buyer.errors.count).to.equal(1)
      expect(buyer.errors.on('receiver_addr')).to.equal(['is not present'])
    })

    it("description must be string", function() {
      var buyer = chai.factory.create('buyer', {description: 1})

      expect(buyer.isValid()).to.be.false
      expect(buyer.errors.count).to.equal(1)
      expect(buyer.errors.on('description')).to.equal(['is not a string'])
    })

    it("alias must be string", function() {
      var buyer = chai.factory.create('buyer', {alias: 1})

      expect(buyer.isValid()).to.be.false
      expect(buyer.errors.count).to.equal(1)
      expect(buyer.errors.on('alias')).to.equal(['is not a string'])
    })

    it("transfer_pkey must be pkey", function() {
      var buyer = chai.factory.create('buyer', {transfer_pkey: 'bad-key'})

      expect(buyer.isValid()).to.be.false
      expect(buyer.errors.count).to.equal(2)
      expect(buyer.errors.on('transfer_pkey')).to.equal([
        'does not match receiver_addr', 'is not a public key' ])
    })

    it("transfer_pkey must be receiver_addr", function() {
      var buyer = chai.factory.create('buyer', 
        {transfer_pkey: globals.tester2_public_key})

      expect(buyer.isValid()).to.be.false
      expect(buyer.errors.count).to.equal(1)
      expect(buyer.errors.on('transfer_pkey')).to.equal(['does not match receiver_addr'])
    })

    it("declaration must be addressed to self", function() {
      var buyer_txid = chai.factory.create('buyer', 
        {receiver_addr: globals.tester2_public_key}).save(test_privkey)

      var buyer = Buyer.find(buyer_txid)

      expect(buyer.isValid()).to.be.false
      expect(buyer.errors.count).to.equal(1)
      expect(buyer.errors.on('receiver_addr')).to.equal(['does not match sender_addr'])
    })

  })

})
