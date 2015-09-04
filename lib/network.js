var path = require('path');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var bitcore = require('bitcore'); 
var p2p = require('bitcore-p2p');

function Network(options){
  if (!(this instanceof Network)) 
    return new Network(options);

  options = options || {};

  this.network = options.network ?
    bitcore.Networks[options.network.toString()]
    : bitcore.Networks.defaultNetwork;

  this.messages = new p2p.Messages({
    network: this.network
  });

  this.pool = new p2p.Pool(options);
}

Network.prototype.getFilteredTxs = function(filter, next){
  var tip = ({ 
    testnet: {
      hash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
      height: 0
    },
    livenet: {
      hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      height: 0
    }
  })[this.network.name];

  if (arguments.length > 2){
    tip = next;
    next = arguments[2];
  }

  var txs = {};
  var currPeer;

  var returnTimeout;
  var done = function(){
    this.pool.disconnect();
    next(null, txs);
  }.bind(this);

  this.pool.on('error', function(err){
    if (returnTimeout) 
      clearTimeout(returnTimeout);
    this.disconnect();
    next(err);
  });

  this.pool.on('peererror', function(peer, err){
    if (peer.status === p2p.Peer.STATUS.CONNECTED) 
      peer.disconnect();
  });
  
  this.pool.on('peerready', function(peer){
    if (!currPeer 
      || peer.bestHeight > currPeer.bestHeight
      || currPeer.status !== p2p.Peer.STATUS.READY){
        currPeer = peer; 
        currPeer.sendMessage(new this.messages.FilterLoad(filter));
        currPeer.sendMessage(new this.messages.GetHeaders({
          starts: [tip.hash],
          stops: new Array(33).join('0')
        }));
    }
  }.bind(this));

  this.pool.on('peerheaders', function(peer, message){
    var headers = message.headers;
    headers.forEach(function(header){
      if (header.validProofOfWork()){
        if (header.toObject().prevHash === tip.hash) tip = {
          hash: header.hash,
          height: tip.height + 1
        };
      }
      if (peer.host !== currPeer.host) return;
      currPeer.sendMessage(new this.messages.GetData([
        new p2p.Inventory.forFilteredBlock(header.hash)]));
    }.bind(this));

    if (headers.length === 2000){
      currPeer.sendMessage(new this.messages.GetHeaders({
        starts: [tip.hash],
        stops: new Array(33).join('0')
      }));
    } else {
      returnTimeout = setTimeout(done, 200);
    }
  }.bind(this)); 

  this.pool.on('peertx', function(peer, message){
    var tx = message.transaction;
    if (returnTimeout){
      clearTimeout(returnTimeout);
      returnTimeout = setTimeout(done, 200);
    }
    tx.inputs.forEach(function(input){
      if (!input.script) return;
      if (input.script.isPublicKeyHashIn() || input.script.isPublicKeyIn()){
        if (input.script.toAddress(this.network).toString() === address.toString()){
          if (!(tx.hash in txs)) txs[tx.hash] = tx;
        }
      }
    }.bind(this));
    tx.outputs.forEach(function(output){
      if (!output.script) return;
      if (output.script.isPublicKeyHashOut() || output.script.isPublicKeyOut()){
        if (output.script.toAddress(this.network).toString() === address.toString()){
          if (!(tx.hash in txs)) txs[tx.hash] = tx;
        }
      }
    }.bind(this));
  }); 

  this.pool.connect();
};

Network.MAIN = bitcore.Networks.livenet;
Network.TEST = bitcore.Networks.testnet;
