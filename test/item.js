/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')
var async = require('async')

var factories = require('../test/factories/factories')
var messages = require('../lib/messages')
var fakeConnection = require('../lib/drivers/fake')
var globals = require('./fixtures/globals')

var expect = chai.expect
var Item = messages.Item

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

  describe('burn addresses', function () {
    it('supports 6 digit distances', function () {
      [90, 0, -90, 51.500782, -51.500782].forEach(function (lat) {
        [90, 0, -90, 51.500782, -51.500782].forEach(function (lon) {
          [9, 8, 5, 2, 0, 101, 11010, 999999, 100000].forEach(function (radius) {
            var addr = chai.factory.create('item', connection, {radius: radius,
               latitude: lat, longitude: lon}).receiverAddr

            expect(addr.length).to.equal(34)

            var parts = /^mfZ([0-9X]{9})([0-9X]{9})([0-9X]{6})/.exec(addr)
            parts = parts.map(function (p) {
              return parseInt(p.replace(/X/g, 0), 10)
            })

            expect(parts[1]).to.equal(Math.floor((lat + 90) * 1000000))
            expect(parts[2]).to.equal(Math.floor((lon + 180) * 1000000))
            expect(parts[3]).to.equal(radius)
          })
        })
      })
    })
  })

  describe('serialization', function () {
    it('serializes toTransaction', function () {
      expect(chai.factory.create('item', connection).toTransaction()).to.eql(
        {tip: 40000, receiverAddr: 'mfZ1415XX782179875331XX1XXXXXgtzWu',
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
          expect(createItem.longitude).to.equal(-0.124669)
          expect(createItem.radius).to.equal(1000)
          expect(createItem.receiverAddr).to.equal('mfZ1415XX782179875331XX1XXXXXgtzWu')
          expect(createItem.senderAddr).to.equal(globals.testerPublicKey)
          Item.find(connection, createItem.txid, function (err, findItem) {
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

    it('updates must be addressed to self', function (nextSpec) {
      var createTxid
      var updateTxid

      async.series([
        function (next) {
          chai.factory.create('item', connection).save(globals.testerPrivateKey,
            function (err, createItem) {
              if (err) throw err
              createTxid = createItem.txid
              next()
            })
        },
        function (next) {
          new Item(connection, {createTxid: createTxid,
            description: 'xyz'}).save(globals.testerPrivateKey,
            function (err, updateItem) {
              if (err) throw err
              updateTxid = updateItem.txid
              next()
            })
        },
        function (next) {
          Item.find(connection, updateTxid, function (err, findItem) {
            if (err) throw err
            expect(findItem.txid).to.be.a('string')
            expect(findItem.description).to.equal('xyz')
            expect(findItem.messageType).to.equal('ITUPDT')
            expect(findItem.receiverAddr).to.equal(globals.testerPublicKey)
            expect(findItem.senderAddr).to.equal(globals.testerPublicKey)
            next()
          })
        }
      ], nextSpec)
    })
  })

  /*
  describe "validations" do
    it "validates default build" do
      expect(Dropzone::Item.sham!(:build).valid?).to eq(true)
    end

    it "validates minimal item" do
      minimal_item = Dropzone::Item.new radius: 1, latitude: 51.500782,
        longitude: -0.124669

      expect(minimal_item.valid?).to eq(true)
    end

    it "requires output address" do
      no_address = Dropzone::Item.sham! latitude: nil, longitude: nil, radius: nil

      expect(no_address.valid?).to eq(false)
      expect(no_address.errors.count).to eq(4)
      expect(no_address.errors.on(:receiver_addr)).to eq(['is not present'])
    end

    it "requires latitude" do
      item = Dropzone::Item.sham! latitude: nil

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(2)
      expect(item.errors.on(:latitude)).to eq(['is not a number'])
    end

    it "requires latitude is gte -90" do
      item = Dropzone::Item.sham! latitude: -90.000001

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:latitude)).to eq(['must be greater than or equal to -90'])
    end

    it "requires latitude is lte 90" do
      item = Dropzone::Item.sham! latitude: 90.000001

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:latitude)).to eq(['must be less than or equal to 90'])
    end

    it "requires longitude" do
      item = Dropzone::Item.sham! longitude: nil

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(2)
      expect(item.errors.on(:longitude)).to eq(['is not a number'])
    end

    it "requires longitude is gte -180" do
      item = Dropzone::Item.sham! longitude: -180.000001

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:longitude)).to eq(['must be greater than or equal to -180'])
    end

    it "requires longitude is lte 180" do
      item = Dropzone::Item.sham! longitude: 180.000001

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:longitude)).to eq(['must be less than or equal to 180'])
    end

    it "requires radius" do
      item = Dropzone::Item.sham! radius: nil

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(2)
      expect(item.errors.on(:radius)).to eq(['is not a number'])
    end

    it "requires radius is gte 0" do
      item = Dropzone::Item.sham! radius: -1

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:radius)).to eq(['must be greater than or equal to 0'])
    end

    it "requires radius is lt 1000000" do
      item = Dropzone::Item.sham! radius: 1000000

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:radius)).to eq(['must be less than 1000000'])
    end

    it "requires message_type" do
      item = Dropzone::Item.sham! message_type: 'INVALD'

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:message_type)).to eq(['is not valid'])
    end

    it "descriptions must be text" do
      item = Dropzone::Item.sham! description: 5

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:description)).to eq(['is not a string'])
    end

    it "price_in_units must be numeric" do
      item = Dropzone::Item.sham! price_in_units: 'abc',
        price_currency: 'USD'

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(2)
      expect(item.errors.on(:price_in_units)).to eq(['is not a number',
        "must be greater than or equal to 0"])
    end

    it "expiration_in must be numeric" do
      item = Dropzone::Item.sham! expiration_in: 'abc'

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(2)
      expect(item.errors.on(:expiration_in)).to eq(['is not a number',
        "must be greater than or equal to 0"])
    end

    it "price_currency must be present if price is present" do
      item = Dropzone::Item.sham! price_in_units: 100, price_currency: nil

      expect(item.valid?).to eq(false)
      expect(item.errors.count).to eq(1)
      expect(item.errors.on(:price_currency)).to eq(['is required if price is specified'])
    end

  end

  describe "distance calculations" do
    it "calculates distance in meters between two points" do
       # New York to London:
       nyc_to_london = Dropzone::Item.distance_between 40.712784, -74.005941,
         51.507351, -0.127758
       texas = Dropzone::Item.distance_between 31.428663, -99.096680,
         36.279707, -102.568359
       hong_kong = Dropzone::Item.distance_between 22.396428, 114.109497,
        22.408489, 113.906937

       expect(nyc_to_london.round).to eq(5570224)
       expect(texas.round).to eq(627363)
       expect(hong_kong.round).to eq(20867)
    end
  end

  describe 'finders' do
    after{ clear_blockchain! }

    before do
      # < 20 km from shinjuku
      fuchu_id = Dropzone::Item.sham!(:build, :description => 'Fuchu',
        :radius => 20_000, :latitude => 35.688533,
        :longitude => 139.471436).save! test_privkey

      increment_block_height!

      # 36 km from shinjuku
      Dropzone::Item.sham!(:build, :description => 'Abiko', :radius => 20_000,
        :latitude => 35.865683, :longitude => 140.031738).save! TESTER2_PRIVATE_KEY

      # 3 km from shinjuku
      Dropzone::Item.sham!(:build, :description => 'Nakano', :radius => 20_000,
        :latitude => 35.708050, :longitude => 139.664383).save! TESTER3_PRIVATE_KEY

      increment_block_height!

      # 38.5 km from shinjuku
      Dropzone::Item.sham!(:build, :description => 'Chiba', :radius => 20_000,
        :latitude => 35.604835, :longitude => 140.105209).save! test_privkey

      # This shouldn't actually be returned, since it's an update, and
      # find_creates_since_block only looks for creates:
      Dropzone::Item.new(create_txid: fuchu_id,
        description: 'xyz').save! test_privkey
    end

    it ".find_creates_since_block()" do
      items = Dropzone::Item.find_creates_since_block block_height, block_height

      expect(items.length).to eq(4)
      expect(items.collect(&:description)).to eq(['Chiba', 'Nakano', 'Abiko',
        'Fuchu'])
    end

    it ".find_in_radius()" do
      # Twenty km around Shinjuku:
      items = Dropzone::Item.find_in_radius block_height, block_height,
        35.689487, 139.691706, 20_000
      expect(items.length).to eq(2)
      expect(items.collect(&:description)).to eq(['Nakano', 'Fuchu'])
    end
  end
   */
})
