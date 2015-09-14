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
})
