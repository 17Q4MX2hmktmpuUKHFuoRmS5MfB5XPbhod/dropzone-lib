/* global describe it before beforeEach afterEach */
/* eslint no-new: 0 */

var chai = require('chai')
var async = require('async')
var bitcore = require('bitcore-lib')

var factories = require('../test/factories/factories')
var messages = require('../lib/messages')
var drivers = require('../lib/drivers')
var globals = require('./fixtures/globals')
var txDecoder = require('../lib/tx_decoder')

var expect = chai.expect
var Item = messages.Item
var Transaction = bitcore.Transaction
var TxDecoder = txDecoder.TxDecoder

factories.dz(chai)

describe('Item', function () {
  var connection = null

  before(function (next) { connection = new drivers.FakeChain({}, next) })
  afterEach(function (next) { connection.clearTransactions(next) })

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

  describe('validations', function () {
    it('validates default build', function (nextSpec) {
      chai.factory.create('item', connection).isValid(
        function (err, res) {
          if (err) throw err
          expect(res).to.be.null
          nextSpec()
        })
    })

    it('validates minimal item', function (nextSpec) {
      new Item(connection, {radius: 1, latitude: 51.500782,
        longitude: -0.124669}).isValid(
        function (err, res) {
          if (err) throw err
          expect(res).to.be.null
          nextSpec()
        })
    })

    it('requires output address', function (nextSpec) {
      new Item(connection, {description: 'Item Description',
        priceCurrency: 'BTC', priceInUnits: 100000000, expirationIn: 6}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(4)
          expect(res.errors[0].message).to.equal('receiverAddr is required')

          nextSpec()
        })
    })

    it('requires latitude', function (nextSpec) {
      chai.factory.create('item', connection, {latitude: null}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(2)
          expect(res.errors[0].message).to.equal('receiverAddr is required')
          expect(res.errors[1].message).to.equal(
            'latitude is required in a newly created item')

          nextSpec()
        })
    })

    it('requires latitude is gte -90', function (nextSpec) {
      chai.factory.create('item', connection, {latitude: -90.000001}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'latitude must be between -90 and 90')

          nextSpec()
        })
    })

    it('requires latitude is lte 90', function (nextSpec) {
      chai.factory.create('item', connection, {latitude: 90.000001}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'latitude must be between -90 and 90')

          nextSpec()
        })
    })

    it('requires longitude', function (nextSpec) {
      chai.factory.create('item', connection, {longitude: null}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(2)
          expect(res.errors[0].message).to.equal('receiverAddr is required')
          expect(res.errors[1].message).to.equal(
            'longitude is required in a newly created item')

          nextSpec()
        })
    })

    it('requires longitude is gte -180', function (nextSpec) {
      chai.factory.create('item', connection, {longitude: -180.000001}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'longitude must be between -180 and 180')

          nextSpec()
        })
    })

    it('requires longitude is lte 180', function (nextSpec) {
      chai.factory.create('item', connection, {longitude: 180.000001}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'longitude must be between -180 and 180')

          nextSpec()
        })
    })

    it('requires radius', function (nextSpec) {
      chai.factory.create('item', connection, {radius: null}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(2)
          expect(res.errors[0].message).to.equal('receiverAddr is required')
          expect(res.errors[1].message).to.equal(
            'radius is required in a newly created item')

          nextSpec()
        })
    })

    it('requires radius is gte 0', function (nextSpec) {
      chai.factory.create('item', connection, {radius: -1}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'radius must be between 0 and 999999')

          nextSpec()
        })
    })

    it('requires radius is lt 1000000', function (nextSpec) {
      chai.factory.create('item', connection, {radius: 1000000}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'radius must be between 0 and 999999')

          nextSpec()
        })
    })

    it('descriptions must be text', function (nextSpec) {
      chai.factory.create('item', connection, {description: 5}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'description is not a string')

          nextSpec()
        })
    })

    it('priceInUnits must be numeric', function (nextSpec) {
      chai.factory.create('item', connection, {priceInUnits: 'abc',
        priceCurrency: 'USD'}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'priceInUnits is not an integer')

          nextSpec()
        })
    })

    it('expirationIn must be numeric', function (nextSpec) {
      chai.factory.create('item', connection, {expirationIn: 'abc'}).isValid(
        function (err, res) {
          if (err) throw err

          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'expirationIn is not an integer')

          nextSpec()
        })
    })

    it('price_currency must be present if price is present', function (nextSpec) {
      chai.factory.create('item', connection, {priceInUnits: 100,
        priceCurrency: undefined}).isValid(
        function (err, res) {
          if (err) throw err
          expect(res.errors.length).to.equal(1)
          expect(res.errors[0].message).to.equal(
            'priceCurrency is required if priceInUnits is provided')

          nextSpec()
        })
    })
  })

  describe('distance calculations', function () {
    it('calculates distance in meters between two points', function () {
      var nycToLondon = Item.distanceBetween(40.712784, -74.005941, 51.507351, -0.127758)
      var texas = Item.distanceBetween(31.428663, -99.096680, 36.279707, -102.568359)
      var hongKong = Item.distanceBetween(22.396428, 114.109497, 22.408489, 113.906937)

      expect(Math.round(nycToLondon)).to.equal(5570224)
      expect(Math.round(texas)).to.equal(627363)
      expect(Math.round(hongKong)).to.equal(20867)
    })
  })

  describe('distance calculations', function () {
    beforeEach(function (nextSpec) {
      var idFuchu

      async.series([
        function (next) {
          // < 20 km from shinjuku
          chai.factory.create('item', connection, { description: 'Fuchu',
            radius: 20000, latitude: 35.688533, longitude: 139.471436
          }).save(globals.testerPrivateKey, function (err, fuchu) {
            if (err) throw err
            idFuchu = fuchu.txid
            next()
          })
        },
        function (next) {
          // 36 km from shinjuku
          connection.incrementBlockHeight()

          chai.factory.create('item', connection, {description: 'Abiko',
            radius: 20000, latitude: 35.865683, longitude: 140.031738
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          // 3 km from shinjuku
          chai.factory.create('item', connection, {description: 'Nakano',
            radius: 20000, latitude: 35.708050, longitude: 139.664383
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          connection.incrementBlockHeight()

          // 38.5 km from shinjuku
          chai.factory.create('item', connection, {description: 'Chiba',
            radius: 20000, latitude: 35.604835, longitude: 140.105209
          }).save(globals.testerPrivateKey, next)
        },
        function (next) {
          // This shouldn't actually be returned, since it's an update, and
          // find_creates_since_block only looks for creates:
          chai.factory.create('item', connection, {description: 'xyz',
            createTxid: idFuchu
          }).save(globals.testerPrivateKey, next)
        }], nextSpec)
    })

    it('.find_creates_since_block()', function (nextSpec) {
      Item.findCreatesSinceBlock(connection, connection.blockHeight,
        connection.blockHeight, function (err, items) {
          if (err) throw err
          expect(items.length).to.equal(4)
          expect(items.map(function (i) { return i.description })).to.deep.equal(
            ['Chiba', 'Nakano', 'Abiko', 'Fuchu'])
          nextSpec()
        })
    })

    it('.find_in_radius()', function (nextSpec) {
      Item.findInRadius(connection, connection.blockHeight,
        connection.blockHeight, 35.689487, 139.691706, 20000,
        function (err, items) {
          if (err) throw err

          expect(items.length).to.equal(2)
          expect(items.map(function (i) { return i.description })).to.deep.equal(
            ['Nakano', 'Fuchu'])
          nextSpec()
        })
    })
  })

  describe('problematic decodes', function () {
    // @Junseth Issue #18:
    // txid: 73cfb35e1e6bb31b3ddffb41322c46f155970bfae3c40385b171ba02f88985a0
    it('Fails to decode invalid radius transaction', function (nextSpec) {
      var txId = '73cfb35e1e6bb31b3ddffb41322c46f155970bfae3c40385b171ba02f88985a0'
      var txHex = '01000000017ecf3bcdd734881a466b2fcb8ff9c602ff96190ecbda86fadd2' +
        'f907bfeb7f22a020000006b4830450221008b343292dbc140379bdcdad613fd8bd2b' +
        'e739147a10f57b5dd3f6c23afe818e402201edbe946b27a0183a3d98ce61f0f88872' +
        '1330c8694f8b700448d8c902317db4c0121031bf0b235cb0cefcf8c9c299f3009257' +
        '04d6da7e6b448bd185c80d28f1216ef44ffffffff0536150000000000001976a9141' +
        'f319c85b0cb2667e09fc4388dc209b0c4a240d388ac3615000000000000695121039' +
        'fb679314a062d887537ad75b6e056bd4020807e56d742cd0aa77bf890aea5e121027' +
        'fdb01ce03a72c67551b80e18a612a4789a6b3d168e4ca883dd7236d2c19b60f21031' +
        'bf0b235cb0cefcf8c9c299f300925704d6da7e6b448bd185c80d28f1216ef4453ae3' +
        '615000000000000695121039fb679166a6b5f8f5951a77ef1a258a50368c22f5dd15' +
        '9dc07a824a29dacaa0a21026bdb01e004a62f2f7b1cceecde622814d2fdb4d63ca5c' +
        '8d1668e2d78263defb421031bf0b235cb0cefcf8c9c299f300925704d6da7e6b448b' +
        'd185c80d28f1216ef4453ae361500000000000069512103aeb679311f267c896372c' +
        '86b8b823adc234ba05d34b631a868c61794bdcdc48221030ffb228a71c85c4a0f74e' +
        'e84aa16582efdd2d6bf488ba4a849bf464d4a6bd93021031bf0b235cb0cefcf8c9c2' +
        '99f300925704d6da7e6b448bd185c80d28f1216ef4453ae2cf41100000000001976a' +
        '9142bb8d14d65d316483e24da5512bfd2a977da85ea88ac00000000'

      var record = new TxDecoder(new Transaction(txHex), {prefix: 'DZ'})

      var item = new Item(connection, {data: record.data, txid: txId,
        receiverAddr: record.receiverAddr, senderAddr: record.senderAddr})

      item.isValid(function (err, res) {
        if (err) throw err

        expect(res.errors.length).to.equal(3)
        expect(res.errors[0].message).to.equal(
          'latitude is required in a newly created item')
        expect(res.errors[1].message).to.equal(
          'longitude is required in a newly created item')
        expect(res.errors[2].message).to.equal(
          'radius is required in a newly created item')

        nextSpec()
      })
    })
  })
})
