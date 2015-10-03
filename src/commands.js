var bitcore = require('bitcore')
var wordwrap = require('wordwrap')
var colors = require('colors')
var network = require('./network')
var session = require('./session')
var messages = require('./messages')

var Table = require('cli-table')

var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var Session = session.Session
var ChatMessage = messages.ChatMessage

var NotAuthenticatedError = session.NotAuthenticatedError

var fail = function (err) {
  var label = colors.red('ERROR')
  if (err instanceof NotAuthenticatedError) {
    console.log(label, err.message)
  } else {
    throw err
  }
}

var display = {}

display.session = function (session, addr) {
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
}

display.sessionMessages = function (session, symmKey, addr) {
  var table = new Table({
    head: ['Chat ' + session.txId],
    colWidths: [80],
    truncate: false
  })
  var rows = []
  session.messages.forEach(function (message) {
    session.unreadMessages -= 1
    try {
      var text = wordwrap.hard(0, 78)(message.getPlain(symmKey))
    } catch (err) {
      return
    }
    var address = colors.red(addr.toString())
    var txId = colors.grey(message.txId)
    if (message.receiverAddr.toString() === addr.toString()) {
      address = message.senderAddr.toString()
      address = colors.red(wordwrap.hard(78 - address.length, 78)(address))
      txId = colors.grey(wordwrap.hard(78 - message.txId.length, 78)(message.txId))
      if (text.length < 78) {
        text = wordwrap.hard(78 - text.length, 78)(text)
      }
    }
    rows = rows.concat([[address], [txId], [text]])
  })
  table.push.apply(table, rows)
  console.log(table.toString())
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
        display.session(session, addr)
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
      display.sessionMessages(session, symmKey, addr)
      session.setUnreadMessages()
    } catch (err) {
      fail(err)
    }
  })
}

chat.say = function (wifPrivKey, hexSessionTxId, messageStr, program) {
  var privKey = PrivateKey.fromWIF(wifPrivKey)
  var addr = privKey.toAddress(network.test)
  var txId = hexSessionTxId
  Session.one(privKey, network.test, txId, function (err, session) {
    try {
      if (err) throw err
      if (!session.isAuthenticated()) {
        if (session.init.senderAddr.toString() === addr.toString()) {
          throw new NotAuthenticatedError()
        } else {
          return session.authenticate(function (err) {
            if (err) throw err
            console.log('Authentication was sent. Please try again in some minutes.')
            return
          })
        }
      }
      var message = new ChatMessage({ contents: messageStr })
      var symmKey = session.genSymmKey()
      message.encrypt(symmKey)
      session.sendMessage(message, function (err, txId) {
        if (err) throw err
        session.messages = session.messages.slice(-1)
        session.unreadMessages = 0
        display.sessionMessages(session, symmKey, addr)
      })
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
    try {
      if (err) throw err
      var session = new Session(privKey, key.secret, {
        receiverAddr: receiverAddr
      })
      session.authenticate(function (err) {
        if (err) throw err
        display.session(session, addr)
      })
    } catch (err) {
      fail(err)
    }
  })
}

module.exports = {
  chat: chat
}
