var _ = require('lodash')
var orm = require('orm')
var bitcore = require('bitcore')

var testnet = bitcore.Networks.testnet
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var Hash = bitcore.crypto.Hash

var FakeBitcoinConnection = function() {
  db = orm.connect("sqlite://")
  this.Transaction = db.define("transactions", {
    txid:         { type: 'serial', key: true },
    data:         { type: 'binary'},
    receiverAddr: { type: 'text', mapsTo: 'receiver_addr'},
    senderAddr:   { type: 'text', mapsTo: 'sender_addr'},
    tip:          { type: 'integer' },
    blockHeight:  { type: 'integer' }
  })

  var height = 0

  this.height = function(){ return height }
  this.clearTransactions = function() {
    //  TODO: Delete all transactions this.Transaction.delete()
    height = 0
  }

  this.incrementBlockHeight = function() {
    return ++height
  }
}

FakeBitcoinConnection.prototype.isTesting = function () {
  return true
}

FakeBitcoinConnection.prototype.privkeyToAddr = function (wif) {
  return PrivateKey.fromWIF(wif).toAddress(testnet).toString()
}

FakeBitcoinConnection.prototype.hash160ToAddr = function (hash160) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex')).toString()
}

FakeBitcoinConnection.prototype.hash160FromAddr = function (addr) {
  return Address.fromString(addr, testnet).hashBuffer.toString('hex')
}

FakeBitcoinConnection.prototype.isValidAddr = function (addr) {
  return Address.isValid(addr, testnet)
}

FakeBitcoinConnection.prototype.save = function (tx, privateKey) {
  /*
   * We ignore the private key in this connection. We return the database id 
   * in lieue of transaction id.
   */
  var blockchainState = {blockHeight: this.height(), 
    senderAddr: this.privkeyToAddr(privateKey)}

  return String(this.Transaction.create( _.merge(tx, blockchainState)))
}

FakeBitcoinConnection.prototype.txById = function (id) {
  return this.Transaction.one(parseInt(id))
}

/*
 * TODO: Remaininig methods
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
