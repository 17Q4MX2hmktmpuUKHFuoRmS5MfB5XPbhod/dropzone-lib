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

var error = colors.red('ERROR')

var fail = function (err) {
  if (err instanceof NotAuthenticatedError ||
    err instanceof InsufficientBalanceError) {
    console.error(error, err.message)
  } else {
    throw err
  }
}

var columns = process.stdout.columns - 2
var padded = columns - 2

if (columns <= 70) {
  console.error(error, 'output not wide enough ' +
    '(need at least 71 columns, but got ' + columns + ')')
  process.exit(1)
}

var display = {}

display.newLine = function () {
  process.stderr.write('\n')
}

display.clearLine = function () {
  process.stderr.cursorTo(0)
  process.stderr.clearLine()
}

display.clearUp = function () {
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
    var wide = columns - 25
    var maxLength = wide - heights.length
    var length = Math.ceil(completed * maxLength)
    process.stderr.cursorTo(0)
    process.stderr.write('Synchronizing ' +
      new Array(length + 1).join('█') +
      new Array((maxLength - length) + 1).join(' ') + ' ' +
      (completed * 100).toFixed(2) + '% ' +
      heights + ' ')
  },
  propagation: function () {
    var throbber = '█  '
    display.chain.clear()
    display.chain._propagation = setInterval(function () {
      process.stderr.cursorTo(0)
      process.stderr.write(throbber +
        ' Waiting for transaction to propagate... ')
      throbber = throbber[2] + throbber.substr(0, 2)
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
    colWidths: [columns],
    truncate: false
  })
  var senderAddr = session.senderAddr.toString()
  var isSender = senderAddr === addr.toString()
  var sender = isSender ? session.receiverAddr.toString() : senderAddr
  var initAddr = session.init.senderAddr
  var isInit = initAddr.toString() === addr.toString()
  var theirAuth = session.getTheirAuth()
  theirAuth = theirAuth ? theirAuth.txId : 'Not accepted'
  theirAuth = wordwrap.hard(padded - theirAuth.length, padded)(theirAuth)
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
  var right = wordwrap.hard(padded - infoWidth, padded)
  table.push([firstAuth], [secondAuth], [sender + right(info)])
  process.stderr.cursorTo(0)
  process.stderr.write(table.toString())
  display.newLine()
}

display.session._message = function (message) {
  var text = wordwrap.hard(0, padded)(message.plain)
  var address = message.senderAddr.toString()
  var txId = colors.grey(message.txId)
  if (message.origin === 'remote') {
    address = wordwrap.hard(padded - address.length, padded)(address)
    txId = colors.grey(wordwrap.hard(padded - message.txId.length, padded)(message.txId))
    if (text.length < padded) {
      text = wordwrap.hard(padded - text.length, padded)(text)
    }
  }
  address = colors.red(address)
  return [[address], [txId], [text]]
}

display.session.messages = function (session, messages) {
  var table = new Table({
    head: ['Chat ' + session.txId],
    colWidths: [columns],
    truncate: false
  })
  var rows = messages.map(display.session._message)
    .reduce(function (acc, row) {
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
    colWidths: [columns],
    truncate: false
  })
  var rows = [display.session._message(message)]
    .reduce(function (acc, row) {
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
        display.session.messages(session, [message])
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
        ;(function expectInput () {
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
        })()
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
