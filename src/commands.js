var bitcore = require('bitcore')
var network = require('./network')
var session = require('./session')

var Table = require('cli-table')

var PrivateKey = bitcore.PrivateKey
var Session = session.Session

var chat = {}

chat.list = function (wifPrivKey, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  var addr = privKey.toAddress(network.test)
  Session.all(privKey, network.test, function (err, sessions) {
    if (err) throw err
    sessions.forEach(function (session) {
      var table = new Table({ head: ['Session', session.id] })
      table.push(['Address', session.senderAddr.toString() === addr.toString()
        ? session.receiverAddr
        : session.senderAddr])
      table.push(['Messages',
        session.unreadMessages + ' Unread / ' +
        session.messages.length + ' Total'])
      console.log(table.toString())
    })
  })
}

module.exports = {
  chat: chat
}
