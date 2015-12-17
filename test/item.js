/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')

var fakeConnection = require('../lib/drivers/fake')
var globals = require('./fixtures/globals')

var expect = chai.expect

factories.dz(chai)

describe('Item', function () {
  var connection = null

  before(function (next) {
    connection = new fakeConnection.FakeBitcoinConnection(function (err) {
      if (err) throw err
      next()
    })
  })

  after(function (next) {
    connection.clearTransactions(function (err) {
      if (err) throw err
      next()
    })
  })

  it('has accessors', function () {
    var item = chai.factory.create('item', connection)

    expect(item.description).to.equal('Item Description')
    expect(item.priceCurrency).to.equal('BTC')
    expect(item.priceInUnits).to.equal(100000000)
    expect(item.expirationIn).to.equal(6)
    expect(item.latitude).to.equal(51.500782)
    expect(item.longitude).to.equal(-0.124669)
    expect(item.radius).to.equal(1000)
    expect(item.receiverAddr).to.equal('mfZ1415XX782179875331XX1XXXXXgtzWu')
    expect(item.senderAddr).to.be.undefined
  })
})
