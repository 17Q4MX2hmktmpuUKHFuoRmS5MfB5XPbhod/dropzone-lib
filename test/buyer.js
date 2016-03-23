/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')

var messages = require('../lib/messages')
var drivers = require('../lib/drivers')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Buyer = messages.Buyer

factories.dz(chai)

describe('Buyer', function () {
  var connection = null

  before(function (next) {
    connection = new drivers.FakeChain({
      blockHeight: messages.LATEST_VERSION_HEIGHT}, next)
  })
  after(function (next) { connection.clearTransactions(next) })

  it('has accessors', function () {
    var buyer = chai.factory.create('buyer', connection)

    expect(buyer.description).to.equal('abc')
    expect(buyer.alias).to.equal('Satoshi')
    expect(buyer.transferAddr).to.not.exist
    expect(buyer.receiverAddr).to.equal(globals.testerPublicKey)
    expect(buyer.senderAddr).to.not.exist
  })

  it('serializes toTransaction', function () {
    expect(chai.factory.create('buyer', connection).toTransaction()).to.eql(
      { tip: 40000, receiverAddr: globals.testerPublicKey,
        data: new Buffer([66, 89, 85, 80, 68, 84, 1, 100, 3, 97, 98, 99, 1, 97,
          7, 83, 97, 116, 111, 115, 104, 105]) })
  })

  describe('#save() and #find()', function () {
    it('persists and loads', function (next) {
      chai.factory.create('buyer', connection).save(globals.testerPrivateKey,
        function (err, createBuyer) {
          if (err) throw err

          expect(createBuyer.txid).to.be.a('string')
          expect(createBuyer.description).to.equal('abc')
          expect(createBuyer.alias).to.equal('Satoshi')
          expect(createBuyer.transferAddr).to.not.exist
          expect(createBuyer.receiverAddr).to.equal(globals.testerPublicKey)
          expect(createBuyer.senderAddr).to.equal(globals.testerPublicKey)

          Buyer.find(connection, createBuyer.txid, function (err, findBuyer) {
            if (err) throw err
            expect(findBuyer.description).to.equal('abc')
            expect(findBuyer.alias).to.equal('Satoshi')
            expect(findBuyer.transferAddr).to.not.exist
            expect(findBuyer.receiverAddr).to.equal(globals.testerPublicKey)
            expect(findBuyer.senderAddr).to.equal(globals.testerPublicKey)
            next()
          })
        })
    })
  })

  describe('validations', function () {
    it('validates default build', function (next) {
      var buyer = chai.factory.create('buyer', connection)

      buyer.isValid(function (err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it('validates minimal buyer', function (next) {
      var buyer = new Buyer(connection,
        {receiverAddr: globals.testerPublicKey})

      buyer.isValid(function (err, res) {
        if (err) throw err
        expect(res).to.be.null
        next()
      })
    })

    it('validates output address must be present', function (next) {
      var buyer = chai.factory.create('buyer', connection,
        {receiverAddr: undefined})

      buyer.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'receiverAddr is required')

        next()
      })
    })

    it('description must be string', function (next) {
      var buyer = chai.factory.create('buyer', connection, {description: 1})

      buyer.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'description is not a string')

        next()
      })
    })

    it('alias must be string', function (next) {
      var buyer = chai.factory.create('buyer', connection, {alias: 1})

      buyer.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'alias is not a string')

        next()
      })
    })

    it('transferAddr must be addr', function (next) {
      var buyer = chai.factory.create('buyer', connection, {transferAddr: 'bad-key'})

      buyer.isValid(function (err, res) {
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
      var buyer = chai.factory.create('buyer', connection,
        {transferAddr: globals.tester2PublicKey})

      buyer.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(1)
        expect(res.errors[0].message).to.equal(
          'transferAddr does not match receiverAddr')

        next()
      })
    })

    it('declaration must be addressed to self', function (next) {
      chai.factory.create('buyer', connection,
        {receiverAddr: globals.tester2PublicKey}).save(globals.testerPrivateKey,
        function (err, createBuyer) {
          if (err) throw err

          Buyer.find(connection, createBuyer.txid, function (err, findBuyer) {
            if (err) throw err

            findBuyer.isValid(function (err, res) {
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
