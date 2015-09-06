var bitcore = require('bitcore')
var network = require('./network')
var session = require('./session')
var Table = require('cli-table')

var PrivateKey = bitcore.PrivateKey
var Session = session.Session

var communication = {}

communication.list = function (wifPrivKey, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  // For now just printing transactions
  Session.all(privKey.toAddress(network.test), function (err, txs) {
    if (err) throw err
    var table = new Table({ head: ['Transactions'] })
    txs.forEach(function (tx) {
      table.push([tx.txId])
    })
    console.log(table.toString())
  })
}

module.exports = {
  communication: communication
}
