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

    assert.deepEqual(encoder.toOpMultisig(), 
      fixtures.asm.getSampleCounterpartyTransactionProtocol2)
  })

  it('Tokenly\'s getSampleCounterpartyTransactionProtocol3()', function () {
    var encoder = new TxEncoder(new Buffer([ 231, 249, 49, 157, 232, 86, 97, 
      195, 49, 48, 232, 11, 125, 241, 103, 51, 22, 72, 146, 238, 178, 225, 251,
       4, 78, 90, 197, 222, 122, 50, 105, 183 ]),
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol3),
      { receiverAddr: "1FEbYaghvr7V53B9csjQTefUtBBQTaDFvN",
        senderPubkey: '0257b0d96d1fe64fbb95b2087e68592ee016c50f102d8dcf776ed166473f27c690' } )

    assert.deepEqual(encoder.toOpMultisig(), 
      fixtures.asm.getSampleCounterpartyTransactionProtocol3)
  })

  it('Tokenly\'s getSampleCounterpartyTransactionProtocol4()', function () {
    var encoder = new TxEncoder(new Buffer([ 166, 237, 184, 97, 113, 252, 119, 
      54, 56, 159, 32, 188, 99, 84, 34, 85, 219, 191, 162, 220, 209, 115, 252, 
      7, 148, 20, 173, 171, 127, 84, 128, 113]),
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol4),
      { receiverAddr: "1Q7VHJDEzVj7YZBVseQWgYvVj3DWDCLwDE",
        senderAddr: '1MFHQCPGtcSfNPXAS6NryWja3TbUN9239Y' } )

    assert.deepEqual(encoder.toOpReturn(), 
      fixtures.asm.getSampleCounterpartyTransactionProtocol4)
  })

  it('Tokenly\'s getSampleCounterpartyTransactionProtocol5()', function () {
    var encoder = new TxEncoder(new Buffer([ 207, 143, 162, 156, 246, 57, 56, 
      167, 135, 231, 50, 200, 80, 113, 105, 86, 104, 185, 224, 11, 254, 223,
      248, 7, 223, 189, 200, 90, 106, 214, 166, 150 ]),
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol5),
      { receiverAddr: "1KUsjZKrkd7LYRV7pbnNJtofsq1HAiz6MF",
        senderAddr: '12iVwKP7jCPnuYy7jbAbyXnZ3FxvgLwvGK' } )

    assert.deepEqual(encoder.toOpReturn(), 
      fixtures.asm.getSampleCounterpartyTransactionProtocol5)
  })

  it('encodes a four output pubkeyhash', function () {
    /* This was from Txid:
       76133a842ced8d76047e070924bca66652b19581803079f200d35fd824499940 */

    var encoder = new TxEncoder(new Buffer([ 100, 44, 103, 30, 153, 243, 181, 
      174, 84, 85, 10, 251, 21, 250, 195, 217, 143, 87, 80, 107, 170, 107, 190,
      149, 250, 21, 183, 240, 124, 102, 78, 27 ]),
      new Buffer(fixtures.decoded.pubkeyHashEncoding),
      { receiverAddr: "1BdHqBSfUqv77XtBSeofH6XwHHczZxKRUF",
        senderAddr: '1Ko36AjTKYh6EzToLU737Bs2pxCsGReApK' } )

    assert.deepEqual(encoder.toOpCheckSig(), 
      fixtures.asm.pubkeyHashEncoding)
  })

  it('Encodes the gigantic multsig satoshi broadcast', function () {
    /* This was from Txid:
       14200afba2c8f91664afc37143763e5987a20647db3443c999137cc41b4db6e4 */

    var encoder = new TxEncoder(new Buffer([ 19, 162, 25, 76, 71, 71, 199, 103, 
      133, 167, 78, 254, 81, 184, 120, 121, 71, 22, 69, 221, 193, 38, 141, 233, 
      202, 166, 37, 243, 169, 163, 5, 69 ]),
      new Buffer(fixtures.decoded.motherOfMultisig),
      { senderPubkey: '02a51147c9e3a554ed35e20cc5ca0fef20e47ae976cfe06a594e135e416bb05e32' } )

    assert.deepEqual(encoder.toOpMultisig(), 
      fixtures.asm.motherOfMultisig)
  })
})
