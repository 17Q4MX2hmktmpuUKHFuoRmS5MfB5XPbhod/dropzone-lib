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
var Seller = buyerSeller.Seller

chai.use(chaiJsFactories)
chai.factory.define('seller', function (conn, args) {
  return new Seller(conn, _.extend({ description: "abc", 
    alias: "Satoshi", communicationsAddr: 'n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv', 
    receiverAddr: globals.testerPublicKey }, args))
})

describe('Seller', function () {
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
    var seller = chai.factory.create('seller', connection)

    expect(seller.description).to.equal("abc")
    expect(seller.alias).to.equal("Satoshi")
    expect(seller.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
    expect(seller.transferAddr).to.not.exist
    expect(seller.receiverAddr).to.equal(globals.testerPublicKey)
    expect(seller.senderAddr).to.not.exist
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('seller', connection).toTransaction()).to.eql(
      { tip: 40000, receiverAddr: globals.testerPublicKey, 
        data: new Buffer([ 83, 76, 85, 80, 68, 84, 1, 100, 3, 97, 98, 99, 1, 97,
          7, 83, 97, 116, 111, 115, 104, 105, 1, 112, 20, 238, 47, 94, 222, 129,
          40, 49, 143, 45, 140, 51, 83, 95, 149, 235, 208, 177, 51, 176, 70]) })
  })

  describe("#save() and #find()", function() {
    it('persists and loads', function (next) {
      chai.factory.create('seller', connection).save(globals.testerPrivateKey, 
        function(err, create_seller) {

        expect(create_seller.description).to.equal("abc")
        expect(create_seller.alias).to.equal("Satoshi")
        expect(create_seller.communicationsAddr).to.equal(
          'n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
        expect(create_seller.transferAddr).to.not.exist
        expect(create_seller.receiverAddr).to.equal(globals.testerPublicKey)
        expect(create_seller.senderAddr).to.equal(globals.testerPublicKey)

        Seller.find(connection, create_seller.txid, function(err, find_seller) {
          expect(find_seller.description).to.equal("abc")
          expect(find_seller.alias).to.equal("Satoshi")
          expect(find_seller.communicationsAddr).to.equal(
            'n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
          expect(find_seller.transferAddr).to.not.exist
          expect(find_seller.receiverAddr).to.equal(globals.testerPublicKey)
          expect(find_seller.senderAddr).to.equal(globals.testerPublicKey)
          next()
        })

      })
    })
  })
  describe("validations", function() {
    it("validates default build", function(next) {
      var seller = chai.factory.create('seller', connection)

      seller.isValid(function(count, errors) {
        expect(count).to.equal(0)
        expect(errors).to.be.empty
        next()
      })
    })

    it("validates minimal seller", function(next) {
      var seller = new Seller( connection, 
        {receiverAddr: globals.testerPublicKey})

      seller.isValid(function(count, errors) {
        expect(count).to.equal(0)
        expect(errors).to.be.empty
        next()
      })
    })

    it("validates output address must be present", function(next) {
      var seller = chai.factory.create('seller', connection, {receiverAddr: null})

      seller.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'receiverAddr', 
          value: undefined, message: 'Required value.'} ])
        next()
      })
    })

    it("description must be string", function(next) {
      var seller = chai.factory.create('seller', connection, {description: 1})

      seller.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'description', 
          value: 1, message: 'Incorrect type. Expected string.'} ])
        next()
      })
    })

    it("alias must be string", function(next) {
      var seller = chai.factory.create('seller', connection, {alias: 1})

      seller.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'alias', 
          value: 1, message: 'Incorrect type. Expected string.'} ])
        next()
      })
    })

    it("communicationsAddr must be addr", function(next) {
      var seller = chai.factory.create('seller', connection, {communicationsAddr: 'bad-key'})

      seller.isValid(function(count, errors) {
        expect(count).to.equal(2)
        expect(errors).to.deep.equal([ 
          {parameter: 'communicationsAddr', value: 'bad-key', 
            message: 'does not match receiverAddr'},
          {parameter: 'communicationsAddr', value: 'bad-key', 
            message: 'must be a valid address'}
        ])
        next()
      })
    })

    it("transferAddr must be addr", function(next) {
      var seller = chai.factory.create('seller', connection, {transferAddr: 'bad-key'})

      seller.isValid(function(count, errors) {
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
      var seller = chai.factory.create('seller',  connection,
        {transferAddr: globals.tester2PublicKey})

      seller.isValid(function(count, errors) {
        expect(count).to.equal(1)
        expect(errors).to.deep.equal([ {parameter: 'transferAddr',
          value: 'mqVRfjepJTxxoDgDt892tCybhmjfKCFNyp', 
          message: 'does not match receiverAddr'} ])
        next()
      })
    })

    it("declaration must be addressed to self", function(next) {
      chai.factory.create('seller', connection,
        {receiverAddr: globals.tester2PublicKey}).save(globals.testerPrivateKey,
        function(err, create_seller) {

        Seller.find(connection, create_seller.txid, function(err, find_seller) {
          find_seller.isValid(function(count, errors) {
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
