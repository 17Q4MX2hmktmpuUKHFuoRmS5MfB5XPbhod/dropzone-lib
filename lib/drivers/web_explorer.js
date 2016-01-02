var async = require('async')
var inherits = require('inherits')
var bitcore = require('bitcore-lib')
var https = require('https')

var txDecoder = require('../tx_decoder')
var messages = require('../messages')

var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var TxDecoder = txDecoder.TxDecoder

// TODO : We should probably standardize these driver errors somewhere
inherits(ConnectionError, Error)

function ConnectionError (message) {
  this.name = this.constructor.name
  this.message = 'Blockchain Driver Error: ' + message
  if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
}

function ConnectionRefusedError () {
  ConnectionError.call(this, 'error connecting via http')
}

function MalformedResponseError () {
  ConnectionError.call(this, 'unrecognized or malformed response from server')
}

function UnsupportedFeatureError () {
  ConnectionError.call(this, 'feature unsupported')
}

function WebExplorer (options, cb) {
  this.__defineGetter__('isMutable', function () { 
    return (options.isMutable || false)
  })
  this.__defineGetter__('mutableNetwork', function () {
    return bitcore.Networks.testnet
  })
  this.__defineGetter__('immutableNetwork', function () {
    return bitcore.Networks.testnet
  })
  this.__defineGetter__('network', function () {
    return (this.isMutable) ? this.mutableNetwork : this.immutableNetwork
  })

  cb(null, this)
}

WebExplorer.prototype.privkeyToAddr = function (wif) {
  return PrivateKey.fromWIF(wif).toAddress(this.network).toString()
}

WebExplorer.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'),
    network || mainnet).toString()
}

WebExplorer.prototype.hash160FromAddr = function (addr, network) {
  return (addr === 0) ? 0
    : Address.fromString(addr, network || mainnet).hashBuffer
}

WebExplorer.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || mainnet)
}

WebExplorer.prototype._hexToAttrs = function (hex) {
  try {
    var record = new TxDecoder(new Transaction(hex), {prefix: 'DZ'})

    if (record.data.length == 0) return null

    return {data: record.data, receiverAddr: record.receiverAddr,
      senderAddr: record.senderAddr}
  } catch (e) {
    return null
  }
}

WebExplorer.prototype._txSatisfiesOptions = function (tx, options) {
  var where = []

  if (options.forAddress) {
    where.push(function (tx) {
      return ((tx.senderAddr === options.forAddress) ||
        (tx.receiverAddr === options.forAddress))
    })
  }

  if ((options.blockHeight !== null) && (typeof options.blockHeight !== 'undefined')) {
    where.push(function (tx) {
      return (tx.blockHeight === parseInt(options.blockHeight, 10))
    })
  } else {
    if (options.startBlock) {
      where.push(function (tx) {
        return (tx.blockHeight >= parseInt(options.startBlock, 10))
      })
    }

    if (options.endBlock) {
      return where.push(function (tx) {
        (tx.blockHeight <= parseInt(options.endBlock, 10))
      })
    }
  }

  if (options.between) {
    var addr1 = options.between[0]
    var addr2 = options.between[1]

    where.push(function (tx) {
      return (((addr1 === tx.senderAddr) && (addr2 === tx.receiverAddr)) ||
        ((addr2 === tx.senderAddr) && (addr1 === tx.receiverAddr)))
    })
  }

  return where.every(function (f) { return f(tx) })
}

WebExplorer.prototype._filterTxs = function (txs, txLoader, filter, cb) {
  var msgs = []

  async.eachSeries(txs, function (tx, next) { 
    txLoader(tx, filter, function(err, txAttrs) {
      if (!txAttrs) return next()
      if (!this._txSatisfiesOptions(txAttrs, filter)) return next()

      var msg = messages.fromTx(this, txAttrs)

      if (!msg) return next()

      msg.isValid(function (err, res) {
        if (err) return cb(err)
        if (res === null) msgs.push(msg)
        next()
      })
    }.bind(this))
  }.bind(this), function (err) {
    if (err) return cb(err)
    
    // Run the last filter on message types here, if applicable
    cb(null, ((msgs.length > 0) && (filter.type))
      ? msgs.filter(function (msg) { return msg.messageType === filter.type })
      : msgs)
  }.bind(this))
}

// TODO : I'm not crazy about this setup, browserify would be much prefferred
//   Also, this doesn't need to be a class method
WebExplorer.prototype._reqCors = function (method, url) {
  // TODO: Refactor this if we're keeping it
  var xhr = new XMLHttpRequest()
  if ("withCredentials" in xhr) {
    // XHR for Chrome/Firefox/Opera/Safari.
    xhr.open(method, url, true)
  } else if (typeof XDomainRequest != "undefined") {
    // XDomainRequest for IE.
    xhr = new XDomainRequest()
    xhr.open(method, url)
  } else {
    // CORS not supported.
    xhr = null
  }
  return xhr
}

// TODO: We may want to just export this instead of use this
WebExplorer.prototype._req = function (parts, cb) {
  var url = [this.baseUrl].concat(parts).join('')

  var requestHandler = function(res){
    var data = ''

    if (res.statusCode !== 200) return cb(new ConnectionRefusedError(), null)

    res.on('data', function (chunk){ data += chunk })
    res.on('end', function() { cb(null, data) })
  }
  var errHandler = function(e) { return cb(new ConnectionRefusedError(), null) }

  if (typeof window === 'undefined') {
    // Node Request:
    https.get(url, requestHandler).on('error', errHandler)
  } else {
    // Browser Request, this acts bizarre on browserify-https and seems to be 
    // a known bug. Let's see if we're running on karma by detecting for 
    // localhost:
    if (window.location.hostname == 'localhost') {
      // TODO: Do we care to preserve this path
      // We assume we're running on karma:
      // Browserify version that is the onely one which works on karma
      //https.request({hostname: "blockchain.info", withCredentials: false, 
      //  path: ["/"].concat(parts).join('')}, requestHandler).on('error', errHandler)
    }

    var xhr = this._reqCors('GET', url)
    if (!xhr) cb(new ConnectionRefusedError(), null) // TODO: probably should be unsupported
    xhr.onload = function() { cb(null, xhr.responseText) }
    xhr.onerror = errHandler
    xhr.send()
  }
}

module.exports = {
  WebExplorer: WebExplorer,
  ConnectionRefusedError: ConnectionRefusedError,
  UnsupportedFeatureError: UnsupportedFeatureError
}
