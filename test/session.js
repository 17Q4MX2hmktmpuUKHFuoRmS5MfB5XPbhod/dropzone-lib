/* global describe it */
/* eslint no-new: 0 */

var assert = require('assert')

var bitcore = require('bitcore')
var session = require('../src/session')
var fixtures = require('./fixtures/session')

var Transaction = bitcore.Transaction
var Session = session.Session

describe('Session', function () {
  it("performs a simple non-deterministic chat", function () {

    /*
    # Note that Der's and IV's are generated randomly on every iteration of this
    # test, which is unlike the extended test.

    buyer_to_seller = Dropzone::Session.new test_privkey,
      BUYER_SESSION_SECRET, receiver_addr: TESTER2_PUBLIC_KEY 

    buyer_to_seller.authenticate!

    seller_to_buyer = Dropzone::Session.new TESTER2_PRIVATE_KEY, SELLER_SESSION_SECRET,
      with: Dropzone::Session.all(TESTER2_PUBLIC_KEY).first 

    seller_to_buyer.authenticate! 

    seller_to_buyer << "Hello Buyer"
    buyer_to_seller << "Hello Seller"

    expect(seller_to_buyer.communications.collect(&:contents_plain)).to eq([
      "Hello Seller", "Hello Buyer" ])
    expect(buyer_to_seller.communications.collect(&:contents_plain)).to eq([
      "Hello Seller", "Hello Buyer" ])
      */
  } )
} )
