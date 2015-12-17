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

  describe("serialization", function () {
    it('serializes toTransaction', function () {
      expect(chai.factory.create('item', connection).toTransaction()).to.eql(
        {tip: 40000, receiverAddr: "mfZ1415XX782179875331XX1XXXXXgtzWu",
          data: new Buffer([73, 84, 67, 82, 84, 69, 1, 100, 16, 73, 116, 101, 
            109, 32, 68, 101, 115, 99, 114, 105, 112, 116, 105, 111, 110, 1, 99,
            3, 66, 84, 67, 1, 112, 254, 0, 225, 245, 5, 1, 101, 6])})
    })
  })

  describe('#save() and #find()', function () {
    it('persists and loads', function (next) {
      chai.factory.create('item', connection).save(globals.testerPrivateKey,
        function (err, createItem) {
          if (err) throw err

          expect(createItem.txid).to.be.a('string')
          expect(createItem.description).to.equal('Item Description')
          expect(createItem.priceCurrency).to.equal('BTC')
          expect(createItem.priceInUnits).to.equal(100000000)
          expect(createItem.expirationIn).to.equal(6)
          expect(createItem.latitude).to.equal(51.500782)
console.log("hmm0")
          expect(createItem.longitude).to.equal(-0.124669)
          expect(createItem.radius).to.equal(1000)
          expect(createItem.receiverAddr).to.equal('mfZ1415XX782179875331XX1XXXXXgtzWu')
          expect(createItem.senderAddr).to.equal(globals.testerPublicKey)
console.log("hmm0")
          Item.find(connection, createItem.txid, function (err, findItem) {
console.log("hmm1")
            if (err) throw err

            expect(findItem.txid).to.be.a('string')
            expect(findItem.description).to.equal('Item Description')
            expect(findItem.priceCurrency).to.equal('BTC')
            expect(findItem.priceInUnits).to.equal(100000000)
            expect(findItem.expirationIn).to.equal(6)
            expect(findItem.latitude).to.equal(51.500782)
            expect(findItem.longitude).to.equal(-0.124669)
            expect(findItem.radius).to.equal(1000)
            expect(findItem.receiverAddr).to.equal('mfZ1415XX782179875331XX1XXXXXgtzWu')
            expect(findItem.senderAddr).to.equal(globals.testerPublicKey)
            next()
          })
        })
    })
  })
 /*
  describe "database" do

      expect(item.description).to eq("Item Description")
      expect(item.price_currency).to eq('BTC')
      expect(item.price_in_units).to eq(100_000_000)
      expect(item.expiration_in).to eq(6)
      expect(item.latitude).to eq(51.500782)
      expect(item.longitude).to eq(-0.124669)
      expect(item.radius).to eq(1000)
      expect(item.receiver_addr).to eq('mfZ1415XX782179875331XX1XXXXXgtzWu')
      expect(Bitcoin.valid_address?(item.receiver_addr)).to be_truthy
      expect(item.sender_addr).to eq(test_pubkey)
    end

    it "updates must be addressed to self" do
      item_id = Dropzone::Item.sham!(:build).save!(test_privkey)

      update_id = Dropzone::Item.new(create_txid: item_id,
        description: 'xyz').save! test_privkey

      update_item = Dropzone::Item.find update_id

      expect(update_item.description).to eq("xyz")
      expect(update_item.message_type).to eq('ITUPDT')
      expect(update_item.sender_addr).to eq(test_pubkey)
      expect(update_item.receiver_addr).to eq(test_pubkey)
    end
  end
*/
})
