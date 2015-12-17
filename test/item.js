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

  describe("burn addresses", function () {
    it ("supports 6 digit distances", function () {
      [90, 0, -90, 51.500782,-51.500782].forEach( function (lat) {
        [90, 0, -90, 51.500782,-51.500782].forEach( function (lon) {
          [9,8,5,2,0,101,11010,999999,100000].forEach( function (radius) {
            var addr = chai.factory.create('item', connection, {radius: radius, 
               latitude: lat, longitude: lon}).receiverAddr

            expect(addr.length).to.equal(34)

            var parts = /^mfZ([0-9X]{9})([0-9X]{9})([0-9X]{6})/.exec(addr)
            parts = parts.map(function (p) { 
              return parseInt(p.replace(/X/g, 0))})

            expect(parts[1]).to.equal(Math.floor((lat+90) * 1000000))
            expect(parts[2]).to.equal(Math.floor((lon+180) * 1000000))
            expect(parts[3]).to.equal(radius)
          })
        })
      })
    })
  })
})
