var bitcore = require('bitcore-lib')
var wordwrap = require('wordwrap')
var colors = require('colors')
var readline = require('readline')
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
    console.error(label, err.message)
  } else {
    throw err
  }
}

var display = {}

display.newLine = function () {
  process.stderr.write("\n")
}

display.clearLine = function () {
  process.stderr.cursorTo(0)
  process.stderr.clearLine()
}

display.clearUp = function () {
  process.stderr.moveCursor(0, -1)
  process.stderr.clearLine()
}

display.write = function (data) {
  process.stderr.write(data)
}

display.chain = {
  _propagation: -1,
  progress: function (blockHeight, maxHeight) {
    var completed = blockHeight / maxHeight
    var heights = blockHeight + '/' + maxHeight
    var maxLength = 56 - heights.length
    var length = Math.ceil(completed * maxLength)
    process.stderr.cursorTo(0)
    process.stderr.write('Synchronizing ' +
      '[' + new Array(length + 1).join('=') +
      new Array((maxLength - length) + 1).join(' ') + '] ' +
      (completed * 100).toFixed(2) + '% ' +
      heights + ' ')
  },
  propagation: function () {
    var chars = '/-\|'
    var index = 0
    display.chain.clear()
    display.chain._propagation = setInterval(function () {
      process.stderr.cursorTo(0)
      process.stderr.write(chars[index] +
        ' Waiting for transaction to propagate... ')
      index = (index + 1) % chars.length
    }, 100)
  },
  clear: function () {
    clearInterval(display.chain._propagation)
    display.clearLine()
  }
}

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
  process.stderr.cursorTo(0)
  process.stderr.write(table.toString())
  display.newLine()
}

display.session._message = function (message) {
  var text = wordwrap.hard(0, 78)(message.plain)
  var address = colors.red(message.receiverAddr.toString())
  var txId = colors.grey(message.txId)
  if (message.origin === 'remote') {
    address = message.senderAddr.toString()
    address = colors.red(wordwrap.hard(78 - address.length, 78)(address))
    txId = colors.grey(wordwrap.hard(78 - message.txId.length, 78)(message.txId))
    if (text.length < 78) {
      text = wordwrap.hard(78 - text.length, 78)(text)
    }
  }
  return [[address], [txId], [text]]
}

display.session.messages = function (session, messages) {
  var table = new Table({
    head: ['Chat ' + session.txId],
    colWidths: [80],
    truncate: false
  })
  var rows = messages.map(display.session._message)
    .reduce(function (acc, row) {
      return acc.concat(row) 
    }, [])
  session.unreadMessages -= messages.length
  table.push.apply(table, rows)
  process.stderr.cursorTo(0)
  process.stderr.write(table.toString())
  display.newLine()
}

display.session.message = function (message) {
  var table = new Table({
    colWidths: [80],
    truncate: false
  })
  var rows = [display.session._message(message)]
    .reduce(function (acc, row) {
      return acc.concat(row) 
    }, [])
  table.push.apply(table, rows)
  process.stderr.cursorTo(0)
  process.stderr.write(table.toString())
  display.newLine()
}

var chat = {}

chat.list = function (strPrivKey, program) {
  try {
    blockchain.use(program.driver, { proxy: program.socks })
      .on('progress', display.chain.progress)
      .on('end', display.chain.clear)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.getAllSessions(privKey, program, function (err, sessions, addr) {
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
    blockchain.use(program.driver, { proxy: program.socks })
      .on('progress', display.chain.progress)
      .on('end', display.chain.clear)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.getAllChatMessages(privKey, txId, program,
      function (err, messages, session) {
        if (err) return fail(err)
        display.session.messages(session, messages)
        session.setUnreadMessages()
      })
  } catch (err) {
    fail(err)
  }
}

chat.create = function (strPrivKey, strReceiverAddr, program) {
  try {
    blockchain.use(program.driver, { proxy: program.socks })
      .on('progress', display.chain.progress)
      .on('propagation', display.chain.propagation)
      .on('end', display.chain.clear)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    var receiverAddr = Address.fromString(strReceiverAddr, Networks.testnet)
    actions.createSession(privKey, receiverAddr, program,
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
    blockchain.use(program.driver, { proxy: program.socks })
      .on('progress', display.chain.progress)
      .on('propagation', display.chain.propagation)
      .on('end', display.chain.clear)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.acceptSession(privKey, txId, program,
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
    blockchain.use(program.driver, { proxy: program.socks })
      .on('progress', display.chain.progress)
      .on('propagation', display.chain.propagation)
      .on('end', display.chain.clear)
    var privKey = PrivateKey.fromWIF(strPrivKey)
    actions.sendChatMessage(privKey, txId, text, program,
      function (err, message, session) {
        if (err) return fail(err)
        display.session.messages([message], session)
      })
  } catch (err) {
    fail(err)
  }
}

chat.open = function (strPrivKey, txId, program) {
  try {
    blockchain.use(program.driver, { proxy: program.socks })
      .on('progress', display.chain.progress)
      .on('propagation', display.chain.propagation)
      .on('end', display.chain.clear)
    var input = readline.createInterface({
      input: process.stdin,
      output: process.stderr
    })
    var privKey = PrivateKey.fromWIF(strPrivKey)
    var seenTxs = {}
    actions.watchAllChatMessages(privKey, txId, program,
      function (err, messages, session) {
        if (err) return fail(err)
        display.session.messages(session, messages)
        session.setUnreadMessages()
        !function expectInput () {
          display.newLine()
          input.question('Message: ', function (text) {
            display.clearUp()
            actions.sendChatMessage(privKey, txId, text, program,
              function (err, message, session) {
                if (err) return fail(err)
                display.session.message(message, session)
                expectInput()
              })
          })
          input.on('line', function () {
              display.clearLine()
          })
        }()
      }, function (message) {
        if (!(message.txId in seenTxs)) {
          seenTxs[message.txId] = 1
          display.session.message(message)
          display.newLine()
          display.write('Message: ') 
        }
      })
  } catch (err) {
    fail(err)
  }
}

module.exports = {
  chat: chat
}
