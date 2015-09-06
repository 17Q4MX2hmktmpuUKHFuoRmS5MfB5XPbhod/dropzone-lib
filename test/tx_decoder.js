var assert = require('assert')
var bitcore = require('bitcore')
var tx_decoder = require('../src/tx_decoder')
var fixtures = require('./fixtures/xcp_tx')

var Transaction = bitcore.Transaction
var TxDecoder = tx_decoder.TxDecoder

describe('TxDecode', function () {
  it('Tokenly\'s getSampleCounterpartyTransactionProtocol2', function () {
      var tx = new Transaction(fixtures[0])
      var record = new TxDecoder(tx)
    
      assert.strictEqual(record.data.toString('utf-8'), 
        new Buffer('\x00\x00\x00\x00\x00\x00\x00\x00\x00' +
          '\x04\xFA\xDF\x00\x00\x00\x17Hv\xE8\x00', "ascii")
        .toString('utf-8'))
      assert.strictEqual(record.receiverAddr.toString(), 
        '12pv1K6LTLPFYXcCwsaU7VWYRSX7BuiF28')
      assert.strictEqual(record.senderAddr.toString(), 
        '1AuTJDwH6xNqxRLEjPB7m86dgmerYVQ5G1')
  })
})
