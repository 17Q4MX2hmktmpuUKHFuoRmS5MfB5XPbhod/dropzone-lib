/* global describe it */
/* eslint no-new: 0 */

var assert = require('assert')

var tx_encoder = require('../src/tx_encoder')
var fixtures = require('./fixtures/xcp_transactions')

var TxEncoder = tx_encoder.TxEncoder

describe('TxEncode', function () {
  it('Tokenly\'s getSampleCounterpartyTransactionProtocol2()', function () {
    var encoder = new TxEncoder(new Buffer([143, 217, 246, 137, 241, 88, 164, 
        38, 134, 114, 21, 219, 222,229, 142, 158, 171, 108, 129, 128, 151, 212,
        191, 43, 207, 11, 209, 69, 143, 60, 85, 171]),
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol2),
      { receiverAddr: "12pv1K6LTLPFYXcCwsaU7VWYRSX7BuiF28",
        senderPubkey: '02f4aef682535628a7e0492b2b5db1aa312348c3095e0258e26b275b25b10290e6' } )

    assert.deepEqual(encoder.toOpMultisig, 
      fixtures.asm.getSampleCounterpartyTransactionProtocol2)
  })
})
