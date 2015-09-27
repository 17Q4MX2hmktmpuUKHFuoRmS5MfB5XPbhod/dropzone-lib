var bitcore = require('bitcore')
var wordwrap = require('wordwrap')
var colors = require('colors')
var network = require('./network')
var session = require('./session')

var Table = require('cli-table')

var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var Session = session.Session

var NotAuthenticated = session.NotAuthenticated

var fail = function (err) {
  var label = colors.red('ERROR')
  if (err instanceof NotAuthenticated) {
    console.log(label, err.message)
  } else {
    throw err
  }
}

var chat = {}

chat.list = function (wifPrivKey, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  var addr = privKey.toAddress(network.test)
  Session.all(privKey, network.test, function (err, sessions) {
    try {
      if (err) throw err
      sessions.filter(function (a, x, c) {
        return !c.filter(function (b, y) {
          return a.txId === b.txId && x > y
        }).length
      }).forEach(function (session) {
        var table = new Table({
          head: ['Chat', session.txId],
          colWidths: [10, 69],
          truncate: false
        })
        var senderAddr = session.senderAddr.toString()
        var isSender = senderAddr === addr.toString()
        table.push(['With', isSender
          ? session.receiverAddr
          : senderAddr])
        table.push(['Messages',
          session.unreadMessages + ' Unread / ' +
          session.messages.length + ' Total'])
        console.log(table.toString())
      })
    } catch (err) {
      fail(err)
    }
  })
}

chat.show = function (wifPrivKey, hexSessionTxId, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  var addr = privKey.toAddress(network.test)
  var txId = hexSessionTxId
  Session.one(privKey, network.test, txId, function (err, session) {
    try {
      if (err) throw err
      var symmKey = session.genSymmKey()
      var table = new Table({
        head: ['Chat ' + session.txId],
        colWidths: [80],
        truncate: false
      })
      var rows = []
      session.messages.forEach(function (message) {
        session.unreadMessages -= 1
        var text = wordwrap.hard(0, 78)(message.getPlain(symmKey))
        var address = addr.toString()
        if (message.receiverAddr.toString() === addr.toString()) {
          address = message.senderAddr.toString()
          address = wordwrap.hard(78 - address.length, 78)(address)
          if (text.length < 78) {
            text = wordwrap.hard(78 - text.length, 78)(text)
          }
        }
        rows = rows.concat([[colors.red(address)], [text]])
      })
      table.push.apply(table, rows)
      console.log(table.toString())
      session.setUnreadMessages()
    } catch (err) {
      fail(err)
    }
  })
}

chat.create = function (wifPrivKey, wifReceiverAddr, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  var addr = privKey.toAddress(network.test)
  var receiverAddr = Address.fromString(wifReceiverAddr, network.test)
  Session.secretFor(addr, receiverAddr, function (err, key) {
    if (err) throw err
    var session = new Session(privKey, key.secret, {
      receiverAddr: receiverAddr
    })
    session.authenticate(Function())
    /*var table = new Table({ head: ['Chat', session.txId] })
    table.push(['Sender', addr])
    table.push(['Receiver', receiverAddr])
    console.log(table.toString())*/
  })
}

module.exports = {
  chat: chat
}
