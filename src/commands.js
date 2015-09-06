var bitcore = require('bitcore')
var network = require('./network')
var session = require('./session')
var Table = require('cli-table')

var PrivateKey = bitcore.PrivateKey
var Session = session.Session

/*var testnet = Network({  
  network: network.test
})

var mainnet = Network({
  network: network.main
})
*/

var communication = {}

communication.list = function (wifPrivKey, program) { 
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  // For now just printing transactions
  // Session.all(privKey.toAddress(network.test), function (err, sessions) {
  Session.all(privKey.toAddress(network.test), function (err, txs) {
    if (err) throw err
    // var table = new Table({ head: ['Session', session.txId] })
    var table = new Table({ head: ['Transactions'] })
    // sessions.forEach(function (session) {
    txs.forEach(function (tx) {
      // table.push([
      //  ['Sender address', session.senderAddr], 
      //  ['Receiver address', session.receiverAddr]
      // ])
      table.push([tx.txId])
    })
    console.log(table.toString())
  })
}

/*
  TxCache.find({ txId: hexPrivKey, isTesting: false}, function () {
    console.log(arguments)
  })
*/

module.exports = {
  communication: communication
}
