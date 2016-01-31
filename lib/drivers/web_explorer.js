var async = require('async')
var merge = require('merge')
var inherits = require('inherits')
var bitcore = require('bitcore-lib')
var request = require('superagent')
var retry = require('retry')

var txDecoder = require('../tx_decoder')
var txEncoder = require('../tx_encoder')
var messages = require('../messages')

var Transaction = bitcore.Transaction
var PrivateKey = bitcore.PrivateKey
var Address = bitcore.Address
var TxDecoder = txDecoder.TxDecoder
var TxEncoder = txEncoder.TxEncoder
var PublicKey = bitcore.PublicKey
var Script = bitcore.Script
var MultiSigInput = bitcore.Transaction.Input.MultiSig
var Output = bitcore.Transaction.Output

var TXO_DUST = 5430

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

function NoUtxosError () {
  ConnectionError.call(this, 'No unspent tranasction outputs were available to spend')
}

function InsufficientBalanceError () {
  ConnectionError.call(this, 'Insufficient balance')
}

function RelayUnacceptedError () {
  ConnectionError.call(this, 'The relay failed due to a malformed transaction')
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

  if (cb) cb(null, this)
}

WebExplorer.prototype.privkeyToAddr = function (wif) {
  return PrivateKey.fromWIF(wif).toAddress(this.network).toString()
}

WebExplorer.prototype.hash160ToAddr = function (hash160, network) {
  return Address.fromPublicKeyHash(new Buffer(hash160, 'hex'),
    network || bitcore.Networks.mainnet).toString()
}

WebExplorer.prototype.hash160FromAddr = function (addr, network) {
  return (addr === 0) ? 0
    : Address.fromString(addr, network || bitcore.Networks.mainnet).hashBuffer
}

WebExplorer.prototype.isValidAddr = function (addr, network) {
  return Address.isValid(addr, network || bitcore.Networks.mainnet)
}

WebExplorer.prototype._hexToAttrs = function (hex) {
  try {
    var tx = new Transaction(hex)

    if (!tx) return null

    var record = new TxDecoder(tx, {prefix: 'DZ'})
    if (record.data.length === 0) return null

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
    txLoader(tx, filter, function (err, txAttrs) {
      if (err) return next(err)
      if (!txAttrs) return next()
      if (!this._txSatisfiesOptions(txAttrs, filter)) return next()

      var msg = messages.fromTx(this, txAttrs)

      if (!msg) return next()

      msg.isValid(function (err, res) {
        if (err) return next(err)
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
  })
}

WebExplorer.prototype._request = function (parts, requestor, cb) {
  var url = [this.baseUrl].concat(parts).join('')

  var operation = retry.operation({retries: 8, factor: 3,
    minTimeout: 1 * 1000, maxTimeout: 60 * 1000, randomize: true})

  operation.attempt(function (currentAttempt) {
    requestor(url, function (err, res) {
      if (operation.retry(err)) return

      if (res.statusCode !== 200) {
        return operation.retry(new ConnectionRefusedError())
      }

      cb(err ? operation.mainError() : null, res.text)
    })
  })
}

WebExplorer.prototype._post = function (parts, data, cb) {
  this._request(parts, function (url, next) {
    request.post(url).send(data).end(next)
  }, cb)
}

WebExplorer.prototype._get = function (parts, cb) {
  this._request(parts, function (url, next) {request.get(url, next)}, cb)
}

// TODO: Nix this
function inspectTransaction(transaction) {
  console.log("Transaction ID:"+transaction.id) 
  console.log("Transaction Inputs:") 
  for (var i=0; i<transaction.inputs.length; i++) {
    var txi = transaction.inputs[i]
    console.log(['  -'+i+':', 'prevTxId:'+txi.prevTxId.toString('hex'),
      'outputIndex:'+txi.outputIndex].join(' '))
  }
  console.log("Transaction Outputs:") 
  for (var i=0; i<transaction.outputs.length; i++) {
    var txo = transaction.outputs[i]
    console.log('  -'+i+': '+txo.inspect())
  }
}

WebExplorer.prototype._createTransaction = function (privateKeyWif, tip, cbOutputs, cb) {
  var privKey = PrivateKey.fromWIF(privateKeyWif, this.network)
  var senderAddr = privKey.toAddress(this.network).toString()
  
  this.getUtxos(senderAddr, function (err, utxos) {
    if (err) return cb(err)

    if (utxos.length == 0) return cb(new InsufficientBalanceError())

    var tx = new bitcore.Transaction()

    // Attach all the Outputs to this trasaction:
    cbOutputs(tx, utxos[0].txid)

    // Add up the satoshis that were needed by the outputs:
    var satoshisNeeded = tip
    for (var i = 0; i < tx.outputs.length; i++) { 
      satoshisNeeded += tx.outputs[i].satoshis
    }

    // Now Allocate Inputs:
    var allocated = 0

    for (var i = 0, l = utxos.length; i < l; i++) {
      var utxo = utxos[i]
      var txoScpt = Script(utxo.script)

      allocated += utxo.satoshis

      if (txoScpt.isMultisigOut()) {
        // TODO: Here's our signing issues, and I think it's the script pubkey
        // order that's borking:

        opCount = txoScpt.getSignatureOperationsCount()
        pubKeys = txoScpt.chunks.slice(1, 1 + opCount).map(function (pubKey) {
          return PublicKey.fromBuffer(pubKey.buf)
        })

        tx.addInput(new MultiSigInput({ output: new Output({
            // I believe this addresses what is probably a bug in the bitcore
            // library, in that the library does a santiy check on the output
            // using a non-standard sort: 
            // https://github.com/bitpay/bitcore-lib/blob/master/lib/transaction/input/multisig.js#L26
            script: Script.buildMultisigOut(pubKeys, 1),
            satoshis: utxo.satoshis
          }),
          prevTxId: utxo.txid, outputIndex: utxo.outputIndex,
          script: utxo.script, publicKeys: pubKeys, threshold: 1}))
      } else {
        tx.from({address: senderAddr, txId: utxo.txid,
          outputIndex: utxo.outputIndex, satoshis: utxo.satoshis,
          script: utxo.script})
      }
      if (allocated >= satoshisNeeded) break
    }

    if (allocated < satoshisNeeded) return cb(new InsufficientBalanceError())

    // And return the change back to the sender:
    if ((allocated - satoshisNeeded) > 0 ) {
      tx.to(senderAddr, allocated - satoshisNeeded)
    }

    tx.sign(privKey)

    console.log("Allocated:"+allocated) // TODO: Remove
    inspectTransaction(tx) // TODO: Remove
console.log("Hmm:")
console.log(tx.serialize())

    var txtwo = bitcore.Transaction(tx.serialize());
    console.log(txtwo.toJSON());

    this.relay(tx.serialize(), function (err) {
      if (err) return cb(err)
      // TODO: do we need to do anything here?
      cb(null, tx)
    })
  }.bind(this))
}

WebExplorer.prototype.sendValue = function (privateKeyWif, receiverAddr, amountInSatoshis, tip, cb) {
  this._createTransaction(privateKeyWif, tip,
    function (tx) { tx.to(receiverAddr, amountInSatoshis) }, cb) 
}

WebExplorer.prototype.save = function (attrs, privateKeyWif, cb) {
  this._createTransaction(privateKeyWif, attrs.tip, function (tx, arcKey) { 
    var txoScpts = new TxEncoder(arcKey, attrs.data, {
      prefix: 'DZ', receiverAddr: this.receiverAddr,
      disableChangeOutput: true, network: this.network,
      senderPubKey: PrivateKey.fromWIF(privateKeyWif).publicKey
    }).toOpMultisig()

    for (var i = 0; i < txoScpts.length; i++) {
      txoScpt = Script.fromASM(txoScpts[i])
      tx.addOutput(new Output({satoshis: TXO_DUST, script: txoScpt}))
    }
  }, function (err, tx) {
    if (err) return cb(err)

    cb(null, merge(attrs,
      {senderAddr: this.privkeyToAddr(privateKeyWif), txid: tx.id}))
  }.bind(this)) 
}

module.exports = {
  WebExplorer: WebExplorer,
  ConnectionRefusedError: ConnectionRefusedError,
  UnsupportedFeatureError: UnsupportedFeatureError,
  MalformedResponseError: MalformedResponseError,
  RelayUnacceptedError: RelayUnacceptedError,
  NoUtxosError: NoUtxosError,
  InsufficientBalanceError: InsufficientBalanceError
}
