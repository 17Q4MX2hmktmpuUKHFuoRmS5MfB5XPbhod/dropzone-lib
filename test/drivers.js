/* global describe it before */
/* eslint no-new: 0 */

var chai = require('chai')
var request = require('superagent')
var bitcore = require('bitcore-lib')

var factories = require('../test/factories/factories')
var drivers = require('../lib/drivers')
var messages = require('../lib/messages')
var globals = require('./fixtures/globals')
var profile = require('../lib/profile')
var txDecoder = require('../lib/tx_decoder')

var expect = chai.expect
var Item = messages.Item
var SellerProfile = profile.SellerProfile
var TxDecoder = txDecoder.TxDecoder

var MUTABLE_ITEM_ID = 'bf01750dab74209fb93e51c659504bb3d155eba7301467f4304e73766881b793'
var GENESIS_ITEM_TXID = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb'
var GENESIS_ITEM_DESC = 'One Bible in fair condition. Conveys the truth of the' +
  ' word of God with little difficulty, even still. Secrets within. Conveys' +
  ' messages of love, peace, self-control, and all the fruits of the Holy' +
  ' Spirit. A copy of the divine revelation, it is this seller’s sincere' +
  ' belief that this book will keep you from suffering for eternity at the' +
  ' hands of evil. A perfect purchase for the person who already has' +
  ' "everything."'
var MAX_ADDR = '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod'

factories.dz(chai)

var validateRawTx = function (rawTx, cb) {
  var data = {hex: rawTx}
  request.post('http://tbtc.blockr.io/api/v1/tx/decode').send(data)
    .end(function (err, res) {
      if (err) return cb(err)

      cb(null, ((res.statusCode === 200) &&
        (JSON.parse(res.text).status === 'success')))
    })
}

var testImmutableItemById = function (next) {
  var connection = new this.Driver()

  Item.find(connection, GENESIS_ITEM_TXID, function (err, genesisItem) {
    if (err) throw err

    expect(genesisItem.txid).to.equal(GENESIS_ITEM_TXID)
    expect(genesisItem.blockHeight).to.equal(371812)
    expect(genesisItem.description).to.equal(GENESIS_ITEM_DESC)
    expect(genesisItem.priceCurrency).to.equal('BTC')
    expect(genesisItem.priceInUnits).to.equal(1000000000)
    expect(genesisItem.expirationIn).to.be.undefined
    expect(genesisItem.latitude).to.equal(37.774836)
    expect(genesisItem.longitude).to.equal(-122.224081)
    expect(genesisItem.radius).to.equal(100)
    expect(genesisItem.receiverAddr).to.equal(
      '1DZ127774836X57775919XXX1XXXXGEZDD')
    expect(genesisItem.senderAddr).to.equal(
      '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod')

    next()
  })
}

var testItemSerialization = function (next) {
  var connection = new this.Driver({isMutable: true})

  // NOTE: This is fairly coupled with the bitcoin/WebExplorer implementation
  // atm, but that's probably just fine.
  connection.toSignedTx(
    chai.factory.create('item', connection).toTransaction(),
      globals.testerPrivateKey,
      function (err, tx) {
        if (err) throw err

        // Kind of useful for testing the fruit of our labor here:
        // console.log('Created: '+tx.id)
        // console.log('Tx: '+tx.serialize())

        expect(tx.id).to.be.a('string')

        var record = new TxDecoder(tx,
          {prefix: 'DZ', network: bitcore.Networks.testnet})

        var createItem = new Item(connection, {data: record.data,
          receiverAddr: record.receiverAddr, senderAddr: record.senderAddr,
          txid: tx.id, tip: tx.getFee()})

        expect(createItem.txid).to.be.a('string')
        expect(createItem.description).to.equal('Item Description')
        expect(createItem.priceCurrency).to.equal('BTC')
        expect(createItem.priceInUnits).to.equal(100000000)
        expect(createItem.expirationIn).to.equal(6)
        expect(createItem.latitude).to.equal(51.500782)
        expect(createItem.longitude).to.equal(-0.124669)
        expect(createItem.radius).to.equal(1000)
        expect(createItem.receiverAddr).to.equal(
          'mfZ1415XX782179875331XX1XXXXXgtzWu')
        expect(createItem.senderAddr).to.equal(globals.testerPublicKey)

        validateRawTx(tx.serialize(), function (err, isValid) {
          if (err) throw err
          expect(isValid).to.be.true
          next()
        })
      })
}

var testMutableItemById = function (next) {
  var connection = new this.Driver({isMutable: true})

  Item.find(connection, MUTABLE_ITEM_ID, function (err, item) {
    if (err) throw err

    expect(item.txid).to.be.a('string')
    expect(item.description).to.equal('Item Description')
    expect(item.priceCurrency).to.equal('BTC')
    expect(item.priceInUnits).to.equal(100000000)
    expect(item.expirationIn).to.equal(6)
    expect(item.latitude).to.equal(51.500782)
    expect(item.longitude).to.equal(-0.124669)
    expect(item.radius).to.equal(1000)
    expect(item.receiverAddr).to.equal(
      'mfZ1415XX782179875331XX1XXXXXgtzWu')
    expect(item.senderAddr).to.equal(globals.testerPublicKey)

    next()
  })
}

var testMessagesByAddr = function (next) {
  var connection = new this.Driver()

  var maxProfile = new SellerProfile(connection, MAX_ADDR)

  maxProfile.getAttributes(function (err, attrs) {
    if (err) throw err

    expect(attrs.validation).to.be.null
    expect(attrs.description).to.equal('Creator of the Protocol.')
    expect(attrs.alias).to.equal('Miracle Max')
    expect(attrs.communicationsAddr).to.equal(
      'mw8Ge8HDBStKyn8u4LTkUwueheFNhuo7Ch')
    expect(attrs.isActive).to.be.true

    next()
  })
}

var testMessagesInBlock = function (next) {
  var connection = new this.Driver()

  Item.findCreatesSinceBlock(connection, 371812, 0, function (err, items) {
    if (err) throw err

    expect(items.length).to.equal(1)
    expect(items[0].txid).to.equal(GENESIS_ITEM_TXID)
    expect(items[0].blockHeight).to.equal(371812)
    expect(items[0].description).to.equal(GENESIS_ITEM_DESC)
    expect(items[0].priceCurrency).to.equal('BTC')
    expect(items[0].priceInUnits).to.equal(1000000000)
    expect(items[0].expirationIn).to.be.undefined
    expect(items[0].latitude).to.equal(37.774836)
    expect(items[0].longitude).to.equal(-122.224081)
    expect(items[0].radius).to.equal(100)
    expect(items[0].receiverAddr).to.equal(
      '1DZ127774836X57775919XXX1XXXXGEZDD')
    expect(items[0].senderAddr).to.equal(
      '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod')

    next()
  })
}

var unsupportedMessagesInBlock = function (next) {
  var connection = new this.Driver()

  connection.messagesInBlock(371812, {}, function (err, messages) {
    expect(err.name).to.equal('UnsupportedFeatureError')
    expect(messages).to.be.undefined
    next()
  })
}

var unsupportedMessagesByAddr = function (next) {
  var connection = new this.Driver()

  var maxProfile = new SellerProfile(connection, MAX_ADDR)

  maxProfile.getAttributes(function (err, attrs) {
    expect(err.name).to.equal('UnsupportedFeatureError')
    expect(attrs).to.be.undefined
    next()
  })
}

var unsupportedMutableItemById = function () {
  expect(function () {
    new this.Driver({isMutable: true})
  }.bind(this)).to.throw('bitcore.ErrorInvalidState')
}

describe('BlockchainDotInfo', function () {
  this.timeout(30000)

  before(function () { this.Driver = drivers.BlockchainDotInfo })

  it('fetches immutable item by id', testImmutableItemById)
  it('mutable item by id is unsupported', unsupportedMutableItemById)
  if (typeof window === 'undefined') {
    it('fetches messagesByAddr', testMessagesByAddr)
    it('fetches messagesInBlock', testMessagesByAddr)
  } else {
    // CORS support is limited with blockchain.info:
    it('messagesByAddr is unsupported', unsupportedMessagesByAddr)
    it('messagesInBlock is unsupported', unsupportedMessagesInBlock)
  }
  // It's kind of impossible to test this code path, since blockchain.info
  // doesn't support mutable blockchains:
  // it('serializes an item', testItemSerialization)
})

describe('BlockrIo', function () {
  this.timeout(30000)

  before(function () { this.Driver = drivers.BlockrIo })

  it('fetches immutable item by id', testImmutableItemById)
  it('fetches mutable item by id', testMutableItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('messagesInBlock is unsupported', unsupportedMessagesInBlock)
  it('serializes an item', testItemSerialization)
})

describe('Insight', function () {
  this.timeout(30000)

  before(function () { this.Driver = drivers.Insight })

  it('fetches immutable item by id', testImmutableItemById)
  it('fetches mutable item by id', testMutableItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  // NOTE: This largely works, but the test takes so long that I'm no longer
  // running it anymore.
  // it('fetches messagesInBlock', testMessagesInBlock)
  it('serializes an item', testItemSerialization)
})

describe('SoChain', function () {
  this.timeout(80000)

  before(function () { this.Driver = drivers.SoChain })

  it('fetches immutable item by id', testImmutableItemById)
  it('fetches mutable item by id', testMutableItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('fetches messagesInBlock', testMessagesInBlock)
  it('serializes an item', testItemSerialization)
})

describe('Toshi', function () {
  this.timeout(80000)

  before(function () { this.Driver = drivers.Toshi })

  it('fetches immutable item by id', testImmutableItemById)
  it('fetches mutable item by id', testMutableItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('fetches messagesInBlock', testMessagesInBlock)
  it('serializes an item', testItemSerialization)
})
