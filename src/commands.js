var bitcore = require('bitcore')
var network = require('./network')
var session = require('./session')
var Table = require('cli-table')

var PrivateKey = bitcore.PrivateKey
var Session = session.Session

var communication = {}

communication.list = function (wifPrivKey, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  var addr = privKey.toAddress(network.test)
  Session.all(addr, network.test, function (err, messages) {
    if (err) throw err
    messages.forEach(function (message) {
      var table = new Table({ head: ['Session', message.txId] })
      table.push(['Sender', message.senderAddr])
      table.push(['Receiver', message.receiverAddr])
      console.log(table.toString())
    })
  })
}

module.exports = {
  communication: communication
}
