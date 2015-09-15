/* global describe it */

var assert = require('assert')
var bitcore = require('bitcore')
var tx_decoder = require('../src/tx_decoder')
var fixtures = require('./fixtures/xcp_tx')

var Transaction = bitcore.Transaction
var TxDecoder = tx_decoder.TxDecoder

describe('TxDecode', function () {
  it('Tokenly\'s getSampleCounterpartyTransactionProtocol2', function () {
      var tx = new Transaction(fixtures.getSampleCounterpartyTransactionProtocol2)
      var record = new TxDecoder(tx)

      assert.deepEqual(record.data,
        new Buffer([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
          0xFA, 0xDF, 0x00, 0x00, 0x00, 0x17, 0x48, 0x76, 0xE8, 0x00]))
      assert.strictEqual(record.receiverAddr.toString(),
        '12pv1K6LTLPFYXcCwsaU7VWYRSX7BuiF28')
      assert.strictEqual(record.senderAddr.toString(),
        '1AuTJDwH6xNqxRLEjPB7m86dgmerYVQ5G1')
    })

  it('Tokenly\'s getSampleCounterpartyTransactionProtocol3', function () {
      var tx = new Transaction(fixtures.getSampleCounterpartyTransactionProtocol3)
      var record = new TxDecoder(tx)

      assert.deepEqual(record.data,
        new Buffer([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
          0xFA, 0xDF, 0x00, 0x00, 0x00, 0x00, 0x0B, 0xEB, 0xC2, 0x00 ]))
      assert.strictEqual(record.receiverAddr.toString(),
        '1FEbYaghvr7V53B9csjQTefUtBBQTaDFvN')
      assert.strictEqual(record.senderAddr.toString(),
        '1291Z6hofAAvH8E886cN9M5uKB1VvwBnup')
    })

  it('Tokenly\'s getSampleCounterpartyTransactionProtocol4', function () {
      var tx = new Transaction(fixtures.getSampleCounterpartyTransactionProtocol4)
      var record = new TxDecoder(tx)

      assert.deepEqual(record.data,
        new Buffer([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
          0xFA, 0xDF, 0x00, 0x00, 0x00, 0x00, 0x05, 0xF5, 0xE1, 0x00 ]))

      assert.strictEqual(record.receiverAddr.toString(),
        '1Q7VHJDEzVj7YZBVseQWgYvVj3DWDCLwDE')
      assert.strictEqual(record.senderAddr.toString(),
        '1MFHQCPGtcSfNPXAS6NryWja3TbUN9239Y')
    })

  it('Tokenly\'s getSampleCounterpartyTransactionProtocol5', function () {
      var tx = new Transaction(fixtures.getSampleCounterpartyTransactionProtocol5)
      var record = new TxDecoder(tx)

      assert.deepEqual(record.data,
        new Buffer([ 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
          0xFA, 0xDF, 0x00, 0x00, 0x00, 0x01, 0x2A, 0x05, 0xF2, 0x00]))

      assert.strictEqual(record.receiverAddr.toString(),
        '1KUsjZKrkd7LYRV7pbnNJtofsq1HAiz6MF')
      assert.strictEqual(record.senderAddr.toString(),
        '12iVwKP7jCPnuYy7jbAbyXnZ3FxvgLwvGK')
    })

  it('decodes a random counterparty transaction', function () {
      // This was from a random Counterparty Broadcast. Txid:
      //   eae1fd843f267d756c765b3e84ff33cd3f7dcde4df671c53b2e3465ba9f1b94e

      var tx = new Transaction(fixtures.randomCounterpartyTransaction)
      var record = new TxDecoder(tx)

      assert.deepEqual(record.data,
        new Buffer([ 0x0, 0x0, 0x0, 0x1e, 0x55, 0x54, 0xa9, 0xa2, 0xbf, 0xf0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x28, 0x42, 0x4c, 0x4f, 0x43, 0x4b, 0x53, 0x43, 0x41, 0x4e, 0x20, 0x56, 0x45, 0x52, 0x49, 0x46, 0x59, 0x2d, 0x41, 0x44, 0x44, 0x52, 0x45, 0x53, 0x53, 0x20, 0x34, 0x6d, 0x6d, 0x71, 0x61, 0x36, 0x69, 0x63, 0x63, 0x62, 0x72, 0x72, 0x67, 0x6b, 0x79 ]))

      assert.strictEqual(record.senderAddr.toString(),
        '1HARUMuoSXftAwY6jxMUutc9uKSCK9zxzF')
      assert.strictEqual(record.receiverAddr, undefined)
    })
})
