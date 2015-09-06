var blockchain = require('./blockchain')

var Blockchain = blockchain.Blockchain

var Messages = {}

Messages.find = function (query, next) {
  query = query || {}  
  if (query.addr) {
    Blockchain.getTxsByAddr(query.addr, next)
  }
}

module.exports = {
  Messages: Messages
}
