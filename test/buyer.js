/* global describe it */
/* eslint no-new: 0 */

var chai = require('chai')
var chaiJsFactories = require('chai-js-factories')
var _ = require('lodash')
var util = require('util')

var fakeConnection = require('../test/lib/fake_connection')
var buyerSeller = require('../lib/buyer_seller')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Buyer = buyerSeller.Buyer


chai.use(chaiJsFactories)
chai.factory.define('buyer', function (conn, args) {
  return new Buyer(conn, _.extend({ description: "abc", 
    alias: "Satoshi", receiverAddr: globals.testerPublicKey }, args))
})

describe('Buyer', function () {
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
    var buyer = chai.factory.create('buyer', connection)

    expect(buyer.description).to.equal("abc")
    expect(buyer.alias).to.equal("Satoshi")
    expect(buyer.transferAddr).to.not.exist
    expect(buyer.receiverAddr).to.equal(globals.testerPublicKey)
    expect(buyer.senderAddr).to.not.exist
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('buyer', connection).toTransaction()).to.eql(
      { tip: 20000, receiverAddr: globals.testerPublicKey, 
        data: new Buffer([66, 89, 85, 80, 68, 84, 1, 100, 3, 97, 98, 99, 1, 97,
          7, 83, 97, 116, 111, 115, 104, 105]) })
  })

  describe("#save() and #find()", function() {
    it('persists and loads', function (next) {
      chai.factory.create('buyer', connection).save(globals.testerPrivateKey, 
        function(err, create_buyer) {

        expect(create_buyer.txid).to.be.a('string')
        expect(create_buyer.description).to.equal("abc")
        expect(create_buyer.alias).to.equal("Satoshi")
        expect(create_buyer.transferAddr).to.not.exist
        expect(create_buyer.receiverAddr).to.equal(globals.testerPublicKey)
        expect(create_buyer.senderAddr).to.equal(globals.testerPublicKey)

        Buyer.find(connection, create_buyer.txid, function(err, find_buyer) {
          expect(find_buyer.description).to.equal("abc")
          expect(find_buyer.alias).to.equal("Satoshi")
          expect(find_buyer.transferAddr).to.not.exist
          expect(find_buyer.receiverAddr).to.equal(globals.testerPublicKey)
          expect(find_buyer.senderAddr).to.equal(globals.testerPublicKey)
          next()
        })

      })
    })
  })

  describe("validations", function() {
    it("validates default build", function(next) {
      var buyer = chai.factory.create('buyer', connection)

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(0)
        expect(errors).to.be.empty
        next()
      })
    })

    it("validates minimal buyer", function(next) {
      var buyer = new Buyer( connection, 
        {receiverAddr: globals.testerPublicKey})

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(0)
        expect(errors).to.be.empty
        next()
      })
    })

    it("validates output address must be present", function(next) {
      var buyer = chai.factory.create('buyer', connection, {receiverAddr: null})

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'receiverAddr', 
          value: undefined, message: 'Required value.'} ])
        next()
      })
    })

    it("description must be string", function(next) {
      var buyer = chai.factory.create('buyer', connection, {description: 1})

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'description', 
          value: 1, message: 'Incorrect type. Expected string.'} ])
        next()
      })
    })

    it("alias must be string", function(next) {
      var buyer = chai.factory.create('buyer', connection, {alias: 1})

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'alias', 
          value: 1, message: 'Incorrect type. Expected string.'} ])
        next()
      })
    })

    it("transferAddr must be addr", function(next) {
      var buyer = chai.factory.create('buyer', connection, {transferAddr: 'bad-key'})

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(2)
        expect(errors).to.deep.equal([ 
          {parameter: 'transferAddr', value: 'bad-key', 
            message: 'does not match receiverAddr'},
          {parameter: 'transferAddr', value: 'bad-key', 
            message: 'must be a valid address'}
        ])
        next()
      })
    })

    it("transferAddr must be receiverAddr", function(next) {
      var buyer = chai.factory.create('buyer',  connection,
        {transferAddr: globals.tester2PublicKey})

      buyer.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'transferAddr',
          value: 'mqVRfjepJTxxoDgDt892tCybhmjfKCFNyp', 
          message: 'does not match receiverAddr'} ])
        next()
      })
    })

    it("declaration must be addressed to self", function(next) {
      chai.factory.create('buyer', connection,
        {receiverAddr: globals.tester2PublicKey}).save(globals.testerPrivateKey,
        function(err, create_buyer) {

        Buyer.find(connection, create_buyer.txid, function(err, find_buyer) {
          find_buyer.isValid(function(count, errors) {
            expect(count).to.equal(1)
            expect(errors).to.deep.equal([ {parameter: 'receiverAddr',
              value: 'mqVRfjepJTxxoDgDt892tCybhmjfKCFNyp', 
              message: 'does not match senderAddr'} ])
            next()
          })
        })
      })
    })
  })

})
