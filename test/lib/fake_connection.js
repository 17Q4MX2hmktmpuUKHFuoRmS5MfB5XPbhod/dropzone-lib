var _ = require('lodash')
var orm = require('orm')
var bitcore = require('bitcore-lib')

var async = require('async')

var testnet = bitcore.Networks.testnet
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var Hash = bitcore.crypto.Hash

var FakeBitcoinConnection = function(cb) {

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

FakeBitcoinConnection.prototype.isTesting = function () {
  return true
}

FakeBitcoinConnection.prototype.privkeyToAddr = function (wif) {
  // TODO: We probably need to handle mainnet here too
  return PrivateKey.fromWIF(wif).toAddress(testnet).toString()
}

FakeBitcoinConnection.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'), 
    network || testnet).toString()
}

FakeBitcoinConnection.prototype.hash160FromAddr = function (addr, network) {
  return Address.fromString(addr, network || testnet).hashBuffer
}

FakeBitcoinConnection.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || testnet)
}

FakeBitcoinConnection.prototype.save = function (tx, privateKey, cb) {
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

FakeBitcoinConnection.prototype.txById = function (id, cb) {
  this.Transaction.get(parseInt(id), function(err, record) {
    cb(err, (record) ? record.toMessageParams() : null)
  })
}

/*
 * TODO: Remaining methods
class FakeBitcoinConnection


  # NOTE: 
  #  - This needs to return the messages in Descending order by block
  #    In the case that two transactions are in the same block, it goes by time
  #  - This should return only 'valid' messages. Not all transactions
  def messages_by_addr(addr, options = {})
    filter_messages transactions.where(
      Sequel.expr(receiver_addr: addr) | Sequel.expr(sender_addr: addr) ), 
      options
  end

  def messages_in_block(block_height, options = {})
    filter_messages transactions.where(
      Sequel.expr(block_height: block_height) ), options
  end


  private

  def filter_messages(messages, options = {})
    if options.has_key?(:start_block)
      messages = messages.where{block_height >= options[:start_block]} 
    end
    if options.has_key?(:end_block)
      messages = messages.where{block_height <= options[:end_block]} 
    end
    
    ret = messages.order(Sequel.desc(:block_height)).order(Sequel.desc(:id)).to_a
    ret = ret.collect{ |tx| 
      msg = Dropzone::MessageBase.new_message_from record_to_tx(tx)
      msg.valid? ? msg : nil
    }.compact

    ret = ret.find_all{|msg| msg.message_type == options[:type]} if ret && options.has_key?(:type)

    if options.has_key?(:between)
      ret = ret.find_all{|c|
        [c.receiver_addr, c.sender_addr].all?{|a| options[:between].include?(a) } }
    end

    (ret) ? ret : []
  end
end
*/

module.exports = {
  FakeBitcoinConnection: FakeBitcoinConnection
}
