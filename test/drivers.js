/* global describe it before */
/* eslint no-new: 0 */

var util = require('util')
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
var Transaction = bitcore.Transaction
var TxDecoder = txDecoder.TxDecoder

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

var testMessagesByAddr = function (next) {
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

var testMessagesInBlock = function (next) {
  Item.findCreatesSinceBlock(this.connection, 371812, 0, function (err, items) {
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
  this.connection.messagesInBlock(371812, {}, function (err, messages) {
    expect(err.name).to.equal('UnsupportedFeatureError')
    expect(messages).to.be.undefined
    next()
  })
}

var unsupportedMessagesByAddr = function (next) {
  var maxProfile = new SellerProfile(this.connection, MAX_ADDR)

  maxProfile.getAttributes(function (err, attrs) {
    expect(err.name).to.equal('UnsupportedFeatureError')
    expect(attrs).to.be.undefined
    next()
  })
}

describe('BlockchainDotInfo', function () {
  this.timeout(30000)

  before(function (next) {
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

  before(function (next) { this.connection = new drivers.BlockrIo({}, next) })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('messagesInBlock is unsupported', unsupportedMessagesInBlock)
})

describe('Insight', function () {
  this.timeout(30000)

  before(function (next) { this.connection = new drivers.Insight({}, next) })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  // NOTE: This largely works, but the test takes so long that I'm no longer
  // running it anymore.
  // it('messagesInBlock is unsupported', testMessagesInBlock)
})

describe('SoChain', function () {
  this.timeout(80000)

  before(function (next) { this.connection = new drivers.SoChain({}, next) })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('fetches messagesInBlock', testMessagesInBlock)
})

describe('Toshi', function () {
  this.timeout(80000)

  before(function (next) { this.connection = new drivers.Toshi({}, next) })

  it('fetches genesis item by id', testItemById)
  it('fetches messagesByAddr', testMessagesByAddr)
  it('fetches messagesInBlock', testMessagesInBlock)

  it('decodes my test', function (next) {

    var connection = new drivers.BlockrIo({isMutable: true})

    // TODO: This was a definate item create (attempt)
    // TODO: I think the encode/decode arc is what's fsk'd
    Item.find(connection, '3902bcd4d90379224672074c60254069b527d2a2ba07585a88a67d393ecb88b3', function (err, item) {
      if (err) throw err
        // TODO: I think these aren't storing correctly, wot do?
      console.log(item)
        next()
    })
   
    // TODO: then get the raw tx decoding here, and bringing that back into the saves an item test
    //var tx = new Transaction('0100000002c6de6ad29bd2436393d9bbb7a4be0598e70a24ab50cc9309103d2fd1e73c492e000000004a00483045022100cfd23f861bce0acdee376d04f819c5d12d8af0ef1fc5701b9b8fece495e401fb0220375c333a7cdd2deab9c0f46cb0ad1dbc061d62a6432dde0623292be5e96de3c201ffffffffc6de6ad29bd2436393d9bbb7a4be0598e70a24ab50cc9309103d2fd1e73c492e010000008a47304402202b32c6be14bfec931585df5cb7789dece163ef92abbd90714336aa7821b290640220253dcf5f971387c6362412f61b8c1fd30eed29a2edea6a4226cf6dfcb7cc8c68014104f3c0f50dd184d22785d0561ba6dd923ed23cf3049c23235436c48a61f18713dd7b38e70684fd24ec009e7a5b8622394a8f4d6c511ae204ba9543451530d15589ffffffff02361500000000000089512103a41d23a988a7ee3e6b9c9662c19aeb99e649702b18e26348f82c0463e387f93721029c67ee1c8d5641e470705749a85f52e42080be9eb7f334cbe66ed4739fb4f8564104f3c0f50dd184d22785d0561ba6dd923ed23cf3049c23235436c48a61f18713dd7b38e70684fd24ec009e7a5b8622394a8f4d6c511ae204ba9543451530d1558953ae0acfe400000000001976a9141ba46d07ec38eb18e97fc1fb9450b161a679a0f088ac00000000')
    //var record = new TxDecoder(tx ,'DZ')

    //next()
  })

  it('saves an item', function (next) {
    var connection = new drivers.Toshi({isMutable: true})

    // NOTE: This is fairly coupled with the bitcoin/WebExplorer implementation
    // atm, but that's probably just fine.
    connection.toSignedTx(
      chai.factory.create('item', connection).toTransaction(), 
        globals.testerPrivateKey, 
        function (err, tx) {
          if (err) throw err

          console.log('Created: '+tx.id)

          expect(tx.id).to.be.a('string')

          var record = new TxDecoder(tx, {prefix: 'DZ'})
          console.log('huhu')
          console.log(tx.outputs[0])

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

          validateRawTx(tx.serialize(), function(err, isValid) {
            if (err) throw err
            expect(isValid).to.be.true
            next()
          })
        })
  })
})
