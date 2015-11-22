var _ = require('lodash')
var util = require('util')
var chaiJsFactories = require('chai-js-factories')

var globals = require('../fixtures/globals')
var invoice = require('../../lib/invoice')
var payment = require('../../lib/payment')
var buyerSeller = require('../../lib/buyer_seller')

var dz = function(chai) {
  if (!chai.factory)
    chai.use(chaiJsFactories)

  if (!chai.factory.factories.buyer)
    chai.factory.define('buyer', function (conn, args) {
      return new buyerSeller.Buyer(conn, _.extend({ description: "abc", 
        alias: "Satoshi", receiverAddr: globals.testerPublicKey }, args))
    })

  if (!chai.factory.factories.seller)
    chai.factory.define('seller', function (conn, args) {
      return new buyerSeller.Seller(conn, _.extend({ description: "abc", 
        alias: "Satoshi", communicationsAddr: 'n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv', 
        receiverAddr: globals.testerPublicKey }, args))
    })

  if (!chai.factory.factories.invoice)
    chai.factory.define('invoice', function (conn, args) {
      return new invoice.Invoice(conn, _.extend({ expirationIn: 6, 
        amountDue: 100000000, receiverAddr: globals.testerPublicKey }, args))
    })

  if (!chai.factory.factories.payment)
    chai.factory.define('payment', function (conn, args) {
      return new payment.Payment(conn, _.extend({ description: 'abc', 
        deliveryQuality: 8, productQuality: 8, communicationsQuality: 8, 
        receiverAddr: globals.tester2PublicKey}, args))
    })
}

module.exports = {
  dz: dz
}
