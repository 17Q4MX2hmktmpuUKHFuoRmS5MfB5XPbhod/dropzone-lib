var extend = require('shallow-extend')
var chaiJsFactories = require('chai-js-factories')

var globals = require('../fixtures/globals')
var messages = require('../../lib/messages')

var Buyer = messages.Buyer
var Seller = messages.Seller
var Invoice = messages.Invoice
var Payment = messages.Payment
var Item = messages.Item

var dz = function (chai) {
  if (!chai.factory) { chai.use(chaiJsFactories) }

  if (!chai.factory.factories.buyer) {
    chai.factory.define('buyer', function (conn, args) {
      return new Buyer(conn, extend({ description: 'abc',
        alias: 'Satoshi', receiverAddr: globals.testerPublicKey }, args))
    })
  }

  if (!chai.factory.factories.seller) {
    chai.factory.define('seller', function (conn, args) {
      return new Seller(conn, extend({ description: 'abc',
        alias: 'Satoshi',
        communicationsAddr: 'n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv',
        receiverAddr: globals.testerPublicKey }, args))
    })
  }

  if (!chai.factory.factories.invoice) {
    chai.factory.define('invoice', function (conn, args) {
      return new Invoice(conn, extend({ expirationIn: 6,
        amountDue: 100000000, receiverAddr: globals.testerPublicKey }, args))
    })
  }

  if (!chai.factory.factories.payment) {
    chai.factory.define('payment', function (conn, args) {
      return new Payment(conn, extend({ description: 'abc',
        deliveryQuality: 8, productQuality: 8, communicationsQuality: 8,
        receiverAddr: globals.tester2PublicKey}, args))
    })
  }

  if (!chai.factory.factories.item) {
    chai.factory.define('item', function (conn, args) {
      return new Item(conn, extend({description: 'Item Description',
        priceCurrency: 'BTC', priceInUnits: 100000000, expirationIn: 6,
        latitude: 51.500782, longitude: -0.124669, radius: 1000}, args))
    })
  }
}

// This creates a fully valid payment, which is a bit more involved than most
// messages
var createPayment = function (chai, conn, options, cb) {
  chai.factory.create('invoice', conn).save(globals.tester2PrivateKey,
    function (err, invoice) {
      if (err) throw err
      cb(null, chai.factory.create('payment', conn,
         extend({invoiceTxid: invoice.txid}, options)))
    })
}

module.exports = {
  dz: dz,
  createPayment: createPayment
}
