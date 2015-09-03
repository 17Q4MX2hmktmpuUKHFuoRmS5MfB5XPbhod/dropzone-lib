/* global describe, it, beforeEach */

var assert = require('assert')

var TxDecode = require('../src/tx_decode')

var fixtures = require('./fixtures/tx_decode')


describe('TxDecode', function () {
  it('Decodes Tokenlys getSampleCounterpartyTransactionProtocol2', function () {
      var tx = Transaction.fromHex(fixtures.getSampleCounterpartyTransactionProtocol2.hex)
      var record = new TxDecode(tx)
    
      assert.strictEqual(record.data, "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x04\xFA\xDF\x00\x00\x00\x17Hv\xE8\x00")
      assert.strictEqual(receiver_addr, '12pv1K6LTLPFYXcCwsaU7VWYRSX7BuiF28')
      assert.strictEqual(record.sender_addr, '1AuTJDwH6xNqxRLEjPB7m86dgmerYVQ5G1')
  })
})
