/* global describe it */
/* eslint no-new: 0 */

var assert = require('assert')

var bitcore = require('bitcore-lib')
var tx_decoder = require('../lib/tx_decoder')
var fixtures = require('./fixtures/xcp_transactions')

var Transaction = bitcore.Transaction
var TxDecoder = tx_decoder.TxDecoder

describe('TxDecode', function () {
  it("Tokenly's getSampleCounterpartyTransactionProtocol2", function () {
    var record = new TxDecoder(
      new Transaction(fixtures.encoded.getSampleCounterpartyTransactionProtocol2))

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol2))
    assert.strictEqual(record.receiverAddr.toString(),
      '12pv1K6LTLPFYXcCwsaU7VWYRSX7BuiF28')
    assert.strictEqual(record.senderAddr.toString(),
      '1AuTJDwH6xNqxRLEjPB7m86dgmerYVQ5G1')
  })

  it("Tokenly's getSampleCounterpartyTransactionProtocol3", function () {
    var tx = new Transaction(fixtures.encoded.getSampleCounterpartyTransactionProtocol3)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol3))
    assert.strictEqual(record.receiverAddr.toString(),
      '1FEbYaghvr7V53B9csjQTefUtBBQTaDFvN')
    assert.strictEqual(record.senderAddr.toString(),
      '1291Z6hofAAvH8E886cN9M5uKB1VvwBnup')
  })

  it("Tokenly's getSampleCounterpartyTransactionProtocol4", function () {
    var tx = new Transaction(fixtures.encoded.getSampleCounterpartyTransactionProtocol4)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol4))
    assert.strictEqual(record.receiverAddr.toString(),
      '1Q7VHJDEzVj7YZBVseQWgYvVj3DWDCLwDE')
    assert.strictEqual(record.senderAddr.toString(),
      '1MFHQCPGtcSfNPXAS6NryWja3TbUN9239Y')
  })

  it("Tokenly's getSampleCounterpartyTransactionProtocol5", function () {
    var tx = new Transaction(fixtures.encoded.getSampleCounterpartyTransactionProtocol5)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.getSampleCounterpartyTransactionProtocol5))
    assert.strictEqual(record.receiverAddr.toString(),
      '1KUsjZKrkd7LYRV7pbnNJtofsq1HAiz6MF')
    assert.strictEqual(record.senderAddr.toString(),
      '12iVwKP7jCPnuYy7jbAbyXnZ3FxvgLwvGK')
  })

  it('decodes a random counterparty transaction', function () {
    /* This was from a random Counterparty Broadcast. Txid:
       eae1fd843f267d756c765b3e84ff33cd3f7dcde4df671c53b2e3465ba9f1b94e */

    var tx = new Transaction(fixtures.encoded.randomCounterpartyTransaction)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.randomCounterpartyTransaction))

    assert.strictEqual(record.senderAddr.toString(),
      '1HARUMuoSXftAwY6jxMUutc9uKSCK9zxzF')
    assert.strictEqual(record.receiverAddr, undefined)
  })

  it('Decodes a pubkeyhash encoding', function () {
    /* This was from Txid:
       76133a842ced8d76047e070924bca66652b19581803079f200d35fd824499940 */

    var tx = new Transaction(fixtures.encoded.pubkeyHashEncoding)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.pubkeyHashEncoding))

    assert.strictEqual(record.senderAddr.toString(),
      '1Ko36AjTKYh6EzToLU737Bs2pxCsGReApK')
    assert.strictEqual(record.receiverAddr.toString(),
      '1BdHqBSfUqv77XtBSeofH6XwHHczZxKRUF')
  })

  it('decodes these weird two output OP_RETURNs', function () {
    /*
      The reason this is a weird transaction is
      because the size of the inputs happens to equal dust_size + tx fee

      This was from Txid:
        05f89f3538e762c534fa9c65200c115b9796386ce2eb8f88f3d7b430873ec302 */

    var tx = new Transaction(fixtures.encoded.twoOutputOpreturns)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data,
      new Buffer(fixtures.decoded.twoOutputOpreturns))

    assert.strictEqual(record.senderAddr, undefined)
    assert.strictEqual(record.receiverAddr.toString(),
      '1DnDQ1ef1eCuFcexZn1wqXFdtbFTQqE9LH')
  })

  it('Decodes the mother of all multisig broadcasts', function () {
    /* This was from Txid:
       14200afba2c8f91664afc37143763e5987a20647db3443c999137cc41b4db6e4 */
    var tx = new Transaction(fixtures.encoded.motherOfMultisig)
    var record = new TxDecoder(tx)

    assert.deepEqual(record.data, new Buffer(fixtures.decoded.motherOfMultisig))

    assert.strictEqual(record.senderAddr.toString(),
      '186sRhi5Ux1eKGzx5vRdq1ueGGB5NKLKRr')
    assert.strictEqual(record.receiverAddr, undefined)
  })

  it("Doesn't support multisig transactions ATM", function () {
    /* Txid:
       d4153cb6c3756d5198af15a018f50731dcdacae86d5448c7404b7e42adf59942 */

    var tx = new Transaction(fixtures.encoded.cpMultisig)
    assert.throws(function () { new TxDecoder(tx) }, tx_decoder.BadDecodingError)
  })

  it("Doesn't parse this weird double output send to self", function () {
    /* Txid: http://www.blockscan.com/txInfo/11675374
       b062d52f7749cf46cbe01e8dd16fe2b7edd6483269c8a0ac5b0b3f8ea6370e5f */

    var tx = new Transaction(fixtures.encoded.cpInvalidSelfie)
    assert.throws(function () { new TxDecoder(tx) }, tx_decoder.BadEncodingError)
  })

  it('Data before addresses', function () {
    /* Txid: http://www.blockscan.com/txInfo/11675370
       54d181aba863bec612355a724095d75fa49fde9c8e161b6240950de1a6b46958 */

    var tx = new Transaction(fixtures.encoded.dataBeforeAddresses)
    assert.throws(function () { new TxDecoder(tx) }, tx_decoder.BadEncodingError)
  })

  it("Doesn't parse this weird double-output spend", function () {
    /* Txid: http://www.blockscan.com/txInfo/11674475
       99beec983f9b700629cb3283b5444e837b73790d2e0eec60f00fdb443340d446 */

    var tx = new Transaction(fixtures.encoded.doubleOutputSpend)
    assert.throws(function () { new TxDecoder(tx) }, tx_decoder.BadEncodingError)
  })
})
