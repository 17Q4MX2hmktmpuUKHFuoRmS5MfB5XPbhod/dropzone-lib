var _ = require('lodash')
var orm = require('orm')
var bitcore = require('bitcore-lib')
var util = require('util')
var async = require('async')

var messages = require('../messages')

var testnet = bitcore.Networks.testnet
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var Hash = bitcore.crypto.Hash

var FakeChain = function(cb) {

  var height = 0

  this.height = function(){ return height }
  this.clearTransactions = function(cb) {
    height = 0
    this.Transaction.all().remove(cb)
  }

  this.incrementBlockHeight = function() {
    return ++height
  }

  var that = this
  var storage = orm.connect("sqlite://", function(err, db) {
    if (err) return cb(err)

    that.Transaction = db.define("transactions", {
      txid:         { type: 'serial', key: true },
      data:         { type: 'binary'},
      receiverAddr: { type: 'text', mapsTo: 'receiver_addr'},
      senderAddr:   { type: 'text', mapsTo: 'sender_addr'},
      tip:          { type: 'integer' },
      blockHeight:  { type: 'integer' }
    }, {
      methods: { toMessageParams: function () {
        return { data: this.data, receiverAddr: this.receiverAddr, 
          senderAddr: this.senderAddr, tip: this.tip, 
          txid: (this.txid) ? String(this.txid) : null} 
      }
    }})

    db.sync(cb)
  })
}

FakeChain.prototype.isTesting = function () {
  return true
}

FakeChain.prototype.privkeyToAddr = function (wif) {
  // TODO: We probably need to handle mainnet here too
  return PrivateKey.fromWIF(wif).toAddress(testnet).toString()
}

FakeChain.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'), 
    network || testnet).toString()
}

FakeChain.prototype.hash160FromAddr = function (addr, network) {
  return Address.fromString(addr, network || testnet).hashBuffer
}

FakeChain.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || testnet)
}

FakeChain.prototype.save = function (tx, privateKey, cb) {
  /*
   * We ignore the private key in this connection. We return the database id 
   * in lieue of transaction id.
   */
  var blockchainState = {blockHeight: this.height(), 
    senderAddr: this.privkeyToAddr(privateKey)}

  this.Transaction.create( _.merge(tx, blockchainState), function(err, record) {
    cb(err, (record) ? record.toMessageParams() : null)
  })
}

FakeChain.prototype.txById = function (id, cb) {
  this.Transaction.get(parseInt(id), function(err, record) {
    if (err && err.literalCode != 'NOT_FOUND')
      throw err

    cb(null, (record) ? record.toMessageParams() : null)
  })
}


/* NOTE: 
 *  - This needs to return the messages in Descending order by block
 *   In the case that two transactions are in the same block, it goes by time
 * - This should return only 'valid' messages. Not all transactions
 */
FakeChain.prototype.messagesByAddr = function (addr, options, cb) {
  this._filterMessages(["sender_addr = ? OR receiver_addr = ?", addr, addr],
    options, cb)
}

FakeChain.prototype.messagesInBlock = function (height, options, cb) {
  this._filterMessages([{blockHeight: height}], options, cb)
}

FakeChain.prototype._filterMessages = function (baseWhere, options, cb) {
  query = this.Transaction.find({}, ['blockHeight', 'Z'], ['txid','Z'])
  query.where.call(baseWhere)

  if (options.startBlock)
    query.where({blockHeight: orm.gte(options.startBlock)})

  if (options.endBlock)
    query.where({blockHeight: orm.lte(options.endBlock)})

  connection = this

  async.waterfall([
    function(next){ query.all(next) },
    function(transactions, waterfallNext){
      async.filter(transactions.map(function(tx){
        return messages.fromTx(connection, tx.toMessageParams()) }), 
        function(msg, next){
        if (!msg) next(false)
  
        msg.isValid(function(err, res) {
          if (err) throw err
       
          next((res) ? false : true)
        })
      }, function(messages) { waterfallNext(null, messages) } )
    }], function (err, messages) {
      if (err) throw err

      if (messages.length > 0) {
        if (options.type)
          messages = messages.filter(function(msg){
            return msg.messageType == options.type})
      }

/* TODO
    if options.has_key?(:between)
      ret = ret.find_all{|c|
        [c.receiver_addr, c.sender_addr].all?{|a| options[:between].include?(a) } }
    end
*/
    cb(null, messages)
  })
}

module.exports = {
  FakeBitcoinConnection: FakeChain
}
