/* global describe it before after */
/* eslint no-new: 0 */

var chai = require('chai')

var factories = require('../test/factories/factories')
var drivers = require('../lib/drivers')
var messages = require('../lib/messages')
var profile = require('../lib/profile')

var expect = chai.expect
var Item = messages.Item
var SellerProfile = profile.SellerProfile

var GENESIS_ITEM_TXID = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb'
var GENESIS_ITEM_DESC = 'One Bible in fair condition. Conveys the truth of the'+
  ' word of God with little difficulty, even still. Secrets within. Conveys'+
  ' messages of love, peace, self-control, and all the fruits of the Holy'+
  ' Spirit. A copy of the divine revelation, it is this seller’s sincere'+
  ' belief that this book will keep you from suffering for eternity at the'+
  ' hands of evil. A perfect purchase for the person who already has'+
  ' "everything."'
var MAX_ADDR = '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod'

var testItemById = function (next) {
  Item.find(this.connection, GENESIS_ITEM_TXID, function (err, genesisItem) {
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

var testMessagesByAddr = function(next) {
  var maxProfile = new SellerProfile(this.connection, MAX_ADDR)

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

var testMessagesInBlock = function(next) {
  Item.findCreatesSinceBlock(this.connection, 371812, 1, function(err, items) {
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

var unsupportedMessagesInBlock = function(next) {
  this.connection.messagesInBlock(371812,{},function(err, messages) {
    expect(err.name).to.equal('UnsupportedFeatureError')
    expect(messages).to.be.undefined
    next()
  })
}

var unsupportedMessagesByAddr = function(next) {
  var maxProfile = new SellerProfile(this.connection, MAX_ADDR)

  maxProfile.getAttributes(function (err, attrs) {
    expect(err.name).to.equal('UnsupportedFeatureError')
    expect(attrs).to.be.undefined
    next()
  })
}

describe('BlockchainDotInfo', function () {
  this.timeout(30000)

  before(function(next) { 
    this.connection = new drivers.BlockchainDotInfo({}, next)
  })

  it('fetches genesis item by id', testItemById)
  if (typeof window === 'undefined') {
    it('fetches messagesByAddr', testMessagesByAddr)
    it('fetches messagesInBlock', testMessagesByAddr)
  } else {
    // CORS support is limited with blockchain.info:
    it('messagesByAddr is unsupported', unsupportedMessagesByAddr)
    it('messagesInBlock is unsupported', unsupportedMessagesInBlock)
  }
})

describe('BlockrIo', function () {
  this.timeout(30000)

  before(function(next) { 
    this.connection = new drivers.BlockrIo({}, next)
  })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('messagesInBlock is unsupported', unsupportedMessagesInBlock)
})

describe('Insight', function () {
  this.timeout(30000)

  before(function(next) { 
    this.connection = new drivers.Insight({}, next)
  })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('messagesInBlock is unsupported', unsupportedMessagesInBlock)
})

describe('SoChain', function () {
  this.timeout(80000)

  before(function(next) { 
    this.connection = new drivers.SoChain({}, next)
  })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('fetches messagesInBlock', testMessagesInBlock)
})
