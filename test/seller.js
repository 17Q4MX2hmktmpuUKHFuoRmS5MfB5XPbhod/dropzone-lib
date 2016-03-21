/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')

var drivers = require('../lib/drivers')
var messages = require('../lib/messages')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Seller = messages.Seller

factories.dz(chai)

describe('Seller', function () {
  var connection = null

  before(function (next) { connection = new drivers.FakeChain({
    blockHeight: messages.LATEST_VERSION_HEIGHT}, next) })
  after(function (next) { connection.clearTransactions(next) })

  it('has accessors', function () {
    var seller = chai.factory.create('seller', connection)

    expect(seller.description).to.equal('abc')
    expect(seller.alias).to.equal('Satoshi')
    expect(seller.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
    expect(seller.transferAddr).to.not.exist
    expect(seller.receiverAddr).to.equal(globals.testerPublicKey)
    expect(seller.senderAddr).to.not.exist
  })

  describe('#save() and #find()', function () {
    it('persists and loads', function (next) {
      chai.factory.create('seller', connection).save(globals.testerPrivateKey,
        function (err, createSeller) {
          if (err) throw err

          expect(createSeller.txid).to.be.a('string')
          expect(createSeller.description).to.equal('abc')
          expect(createSeller.alias).to.equal('Satoshi')
          expect(createSeller.communicationsAddr)
            .to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
          expect(createSeller.transferAddr).to.not.exist
          expect(createSeller.receiverAddr).to.equal(globals.testerPublicKey)
          expect(createSeller.senderAddr).to.equal(globals.testerPublicKey)

          Seller.find(connection, createSeller.txid, function (err, findSeller) {
            if (err) throw err
            expect(findSeller.description).to.equal('abc')
            expect(findSeller.alias).to.equal('Satoshi')
            expect(findSeller.communicationsAddr)
              .to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(findSeller.transferAddr).to.not.exist
            expect(findSeller.receiverAddr).to.equal(globals.testerPublicKey)
            expect(findSeller.senderAddr).to.equal(globals.testerPublicKey)
            next()
          })
        })
    })
  })

  describe('validations', function () {
    it('validates default build', function (next) {
      var seller = chai.factory.create('seller', connection)

      seller.isValid(function (err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it('validates minimal seller', function (next) {
      var seller = new Seller(connection,
        {receiverAddr: globals.testerPublicKey})

      seller.isValid(function (err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it('validates output address must be present', function (next) {
      var seller = chai.factory.create('seller', connection,
        {receiverAddr: undefined})

      seller.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'receiverAddr is required')

        next()
      })
    })

    it('description must be string', function (next) {
      var seller = chai.factory.create('seller', connection, {description: 1})

      seller.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'description is not a string')

        next()
      })
    })

    it('alias must be string', function (next) {
      var seller = chai.factory.create('seller', connection, {alias: 1})

      seller.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'alias is not a string')

        next()
      })
    })

    it('communicationsAddr must be addr', function (next) {
      var seller = chai.factory.create('seller', connection, {communicationsAddr: 'bad-key'})

      seller.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'communicationsAddr must be a valid address')

        next()
      })
    })

    it('transferAddr must be addr', function (next) {
      var seller = chai.factory.create('seller', connection, {transferAddr: 'bad-key'})

      seller.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(2)
        expect(res.errors[0].message).to.equal(
          'transferAddr does not match receiverAddr')
        expect(res.errors[1].message).to.equal(
          'transferAddr must be a valid address')

        next()
      })
    })

    it('transferAddr must be receiverAddr', function (next) {
      var seller = chai.factory.create('seller', connection,
        {transferAddr: globals.tester2PublicKey})

      seller.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'transferAddr does not match receiverAddr')

        next()
      })
    })

    it('declaration must be addressed to self', function (next) {
      chai.factory.create('seller', connection,
        {receiverAddr: globals.tester2PublicKey}).save(globals.testerPrivateKey,
        function (err, createSeller) {
          if (err) throw err

          Seller.find(connection, createSeller.txid, function (err, findSeller) {
            if (err) throw err

            findSeller.isValid(function (err, res) {
              if (err) throw err

              expect(res.errors.length).to.equal(1)
              expect(res.errors[0].message).to.equal(
                'receiverAddr does not match senderAddr')

              next()
            })
          })
        })
    })
  })
})
