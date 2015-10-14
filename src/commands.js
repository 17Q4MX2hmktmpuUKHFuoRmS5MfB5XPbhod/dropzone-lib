var bitcore = require('bitcore')
var wordwrap = require('wordwrap')
var colors = require('colors')
var actions = require('./actions')
var session = require('./session')
var messages = require('./messages')
var blockchain = require('./blockchain')

var Table = require('cli-table')

var Networks = bitcore.Networks
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address

var NotAuthenticatedError = session.NotAuthenticatedError
var InsufficientBalanceError = messages.InsufficientBalanceError

var fail = function (err) {
  var label = colors.red('ERROR')
  if (err instanceof NotAuthenticatedError ||
    err instanceof InsufficientBalanceError) {
    console.log(label, err.message)
  } else {
    throw err
  }
}

var display = {}

display.session = function (session, addr) {
  var table = new Table({
    head: ['Chat ' + session.txId],
    colWidths: [80],
    truncate: false
  })
  var senderAddr = session.senderAddr.toString()
  var isSender = senderAddr === addr.toString()
  var sender = isSender ? session.receiverAddr.toString() : senderAddr
  var initAddr = session.init.senderAddr
  var isInit = initAddr.toString() === addr.toString()
  var theirAuth = session.getTheirAuth()
  theirAuth = theirAuth ? theirAuth.txId : 'Not accepted'
  theirAuth = wordwrap.hard(78 - theirAuth.length, 78)(theirAuth)
  theirAuth = colors.grey(theirAuth)
  var ourAuth = session.getOurAuth()
  ourAuth = ourAuth ? colors.grey(ourAuth.txId) : colors.red('Accept?')
  var firstAuth = isInit ? ourAuth : theirAuth
  var secondAuth = isInit ? theirAuth : ourAuth
  var messages = session.messages.length + ' Message'
  messages += session.messages.length !== 1 ? 's' : ''
  var newMessages = session.unreadMessages ? session.unreadMessages + ' New / ' : ''
  var info = colors.green(newMessages) + colors.grey(messages)
  var infoWidth = sender.length + messages.length + newMessages.length
  var right = wordwrap.hard(78 - infoWidth, 78)
  table.push([firstAuth], [secondAuth], [sender + right(info)])
  console.log(table.toString())
}

display.sessionMessages = function (messages, session, symmKey, addr) {
  var table = new Table({
    head: ['Chat ' + session.txId],
    colWidths: [80],
    truncate: false
  })
  var rows = []
  messages.forEach(function (message) {
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

chat.list = function (strPrivKey, program) {
  try {
    blockchain.use(program.driver)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.getAllSessions(privKey, function (err, sessions, addr) {
      if (err) return fail(err)
      sessions.forEach(function (session) {
        display.session(session, addr)
      })
    })
  } catch (err) {
    fail(err)
  }
}

chat.show = function (strPrivKey, txId, program) {
  try {
    blockchain.use(program.driver)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.getAllChatMessages(privKey, txId,
      function (err, messages, session, symmKey, addr) {
        if (err) return fail(err)
        display.sessionMessages(messages, session, symmKey, addr)
        session.setUnreadMessages()
      })
  } catch (err) {
    fail(err)
  }
}

chat.create = function (strPrivKey, strReceiverAddr, program) {
  try {
    blockchain.use(program.driver)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    var receiverAddr = Address.fromString(strReceiverAddr, Networks.testnet)
    actions.createSession(privKey, receiverAddr,
      function (err, session, addr) {
        if (err) return fail(err)
        display.session(session, addr)
      })
  } catch (err) {
    fail(err)
  }
}

chat.accept = function (strPrivKey, txId, program) {
  try {
    blockchain.use(program.driver)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.acceptSession(privKey, txId,
      function (err, session, addr) {
        if (err) return fail(err)
        display.session(session, addr)
      })
  } catch (err) {
    fail(err)
  }
}

chat.say = function (strPrivKey, txId, text, program) {
  try {
    blockchain.use(program.driver)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.sendChatMessage(privKey, txId, text,
      function (err, messages, session, symmKey, addr) {
        if (err) return fail(err)
        display.sessionMessages(messages, session, symmKey, addr)
      })
  } catch (err) {
    fail(err)
  }
}

module.exports = {
  chat: chat
}
