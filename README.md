# dropzone-lib ![Drop Zone](https://raw.githubusercontent.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/master/dropzone-logo-32x32.png)
[![NPM Package](https://img.shields.io/npm/v/dropzone-lib.svg?style=flat-square)](https://www.npmjs.org/package/dropzone-lib)
[![Build Status](https://img.shields.io/travis/ScroogeMcDuckButWithBitcoin/dropzone-lib.svg?branch=master&style=flat-square)](https://travis-ci.org/ScroogeMcDuckButWithBitcoin/dropzone-lib)

An Anonymous Peer-To-Peer Local Contraband Marketplace built with Bitcoin.

* [Start By Reading the White Paper](https://github.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/blob/master/Drop%20Zone%20-%20Whitepaper.pdf) (it's not too technical)
* Then [check out an explorer](http://dropzone.xchain.io/) to see who's posting and what they're buying.
* And lastly [check out the dropzone-lib jsdoc](http://17q4mx2hmktmpuukhfuorms5mfb5xpbhod.github.io/dropzone-lib/) for detailed information on how to use this library.

## Author's Manifesto
![Drop Zone](https://github.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/raw/master/dropzone-screenshot.jpg)

To whom it may concern,

Markets are objects of censorship and always have been.  There is a presumed 
division, that renders commerce distinct from the notion of free speech.  But I 
will allege that the act of commerce is, itself, indistinct from speech.  Where 
or how one spends their value is a decision as personal and poignant as any 
words ever spoken or letters ever written.

As a unfortunate consequence of freedom, bad actors will engage in repugnant 
trade that impinges upon the rights and freedoms of others.  It is the job of 
humanity to cooperate and see to it that trade, such as this, becomes 
unprofitable.  Whether it is accomplished through technological achievement or 
through the adjustment of social mores, or perhaps a simple appeal to the 
underlying natural law, it is not the job of bad acting third parties to force 
into hiding commerce that must be dealt with by means of an adjustment to the 
global, social conscience.

Cooperation, in the manner I was just speaking about, has never been plausible 
until the invention of The Blockchain.  I will not foist upon Satoshi's humble 
creation such impracticable possibilities as the achievement of world peace.  
But in approaching Drop Zone, I am attempting to do nothing more than what is 
possible and possibly more efficient than what exists.  I wish for Drop Zone 
to be nothing more than an appendage to The Blockchain.  As such, it is every 
bit as much Bitcoin as Bitcoin itself.  Just as a fungible Bitcoin enables the 
exchange of spaceless value with near impunity, Drop Zone removes the ability 
of unwelcome parties from glancing over the shoulders of those in the act of an 
exchange, whatever it entails.  This technology disrupts the ability of buyers 
to gain insight into the identities or movements of suppliers making supply 
chains far less vulnerable to disruption.  It is this innovation that separates 
this project from all other decentralized market solutions.

Whereas Bitcoin forces us to consider the nature of money and value, Drop Zone 
will do the same for commerce.  At its root, Bitcoin is a message passing 
system.  Those messages that are passed, unlike any electronic message that's 
come before it, articulate value.  Commerce is, and has always been, similarly 
inclined toward message passing.  Whether in-person, over email, or through 
large, online shopping carts, fundamentally, commerce is composed of messages 
that are in service of the transaction wherein a final message of value is sent 
to a recipient in exchange for a negotiated good or service.  As such, Drop 
Zone is a secure message passing protocol inasmuch as it is a platform for 
commerce.  And while the problem is far beyond the scope or capabilities of 
the protocol in its most fundamental form, the observant might even see the 
tenuous skeleton of a full-fledged reputation system.  Such a project is, in 
itself, as important and difficult as any facing this decentralized ecosystem.

I hope that Drop Zone lets us all dream of a day when no man will any longer be 
made to suffer indignity for simply engaging in unpopular or stigmatized 
commerce.  May all commerce be created equal.

Today is a Beautiful day,

__Miracle Max__
__quia omnis qui se exaltat humiliabitur et qui se humiliat exaltabitur__

## Important Whitepaper Errata
  * The white paper expressed 8 digits of precision for the listing radius. This implementation instead uses 6 digits. If additional precision is later deemed necessary, a field can be added to the listing to accomodate enhanced precision
  * The white paper expressed pkeys (addresses) as being encoded ints. These are instead encoded as variable length strings.
  * The white paper expressed transaction ids as being encoded ints. These are instead encoded as variable length strings.

## Getting Started in your Web Browser

Download our packaged dropzone-lib.min.js and include it in your html via a script tag:
```html
<script src="dropzone-lib.min.js"></script>
```

## Getting Started in node

Before you begin you'll need to have Node.js v0.12 installed. There are several 
options for installation. One method is to use 
[nvm](https://github.com/creationix/nvm) to easily switch between different 
versions, or download directly from [Node.js](https://nodejs.org/).

```bash
npm install -g dropzone-lib
```

## Using dropzone-lib
The library syntax is still being finalized, but almost all dropzone functions 
are currently supported in this library.

### Define a Connection/Driver
Unless you plan to feed raw binary data into objects yourself (more on this later)
you're going to want to start by connecting dropzone to a blockchain.

Blockchain connection objects should be created at the inception of your program.
Currently (and let's be real here - all that matters), Bitcoin connections are 
the only supported blockchain connections.

An SPV driver is still being developed, but for the time being, support exists
for the following block explorers, which are queried via http: BlockchainDotInfo,
BlockrIo, Insight, Toshi, and SoChain. Only Insight, Toshi, and SoChain support
all functions via cors requests. 

**Toshi is the reccommended driver for read** queries at this time 
due to its speed.

**BlockrIo is the reccommended driver for write/save operations** at this time.
Toshi seems to have problems with relaying to the mempool quickly.

Mainnet Connections are created like so:

```js
var dropzone = require('dropzone-lib');
var Toshi = dropzone.drivers.Toshi;

// By default, connections are instantiated to mainnet
connMainnet = new Toshi({}, function(err, toshiConnection){ 
  // Connection initialized...
});
```

Testnet Connections are created with the isMutable parameter set to true:

```js
var dropzone = require('dropzone-lib');
// If you're not save()'ing transactions, toshi is actually a better driver
// SoChain was used here to demonstrate that multiple explorers are supported:
var SoChain = dropzone.drivers.SoChain;

connTestnet = new SoChain({isMutable: true});
```

### Load a listing from a transaction id
This example loads the Miracle Max bible listing from the blockchain. Note that
"Listings" contain the up-to-date state of an Item, and will reflect the attributes
present in the original listing, plus all modifications to that listing thereafter.

```js
var Listing = dropzone.Listing;

var BIBLE_TXID = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb';

bible = new Listing(connMainnet, BIBLE_TXID);

// Scans the seller's address for the original listing, plus all updates:
bible.getAttributes(function (err, attrs) {
  if (err) throw err;

  console.log(attrs);
});
```

### Find all Listings created in the last 'n' blocks
To find all items created between blocks 371814 to 371810:

```js
var Item = dropzone.messages.Item;

Item.findCreatesSinceBlock(connMainnet, 371814, 4, function (err, items) {
  if (err) throw err;

  for (i=0; i < items.length; i++) {
    console.log(items[i].description);
  }
});
```

### Load a Seller profile from an address
This example loads the Miracle Max seller profile from the blockchain. Note that
"SellerProfile" contains the up-to-date state of an seller, and will reflect the 
attributes present in the original seller declaration, plus all modifications 
to that declaration thereafter.

```js
var SellerProfile = dropzone.SellerProfile;

var maxProfile = new SellerProfile(connMainnet, '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod');

// Scans the seller's address for the original declaration, plus all updates:
maxProfile.getAttributes(function (err, attrs) {
  if (err) throw err;

  console.log(attrs);
});
```

### Load an invoice from a transaction id
This example loads an invoice message directly. "Messages" do not track state
outside the current transaction, and can be located in dropzone.messages. 
These messages are loosely based on an ORM pattern's 'model'.

```js
var Invoice = dropzone.messages.Invoice;

var INVOICE_TXID = 'e5a564d54ab9de50fc6eba4176991b7eb8f84bbeca3482ca032c12c1c0050ae3';

Invoice.find(connMainnet, INVOICE_TXID, function (err, invoice) {
  console.log(invoice.expirationIn);
  console.log(invoice.amountDue);
  console.log(invoice.receiverAddr);
  console.log(invoice.senderAddr);
});
```

### Load an item from raw transaction hex string
For those who have a transaction already available, and simply want to de-serialize
that transaction into its Drop Zone representation, the code to do so is as
follows:

```js
var Invoice = dropzone.messages.Invoice;

var txId = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb';
var txHex = '01000000017....'; // Be sure to include the entire hex here

var record = new TxDecoder(new Transaction(txHex), {prefix: 'DZ'});

var item = new Item(connMainnet, {data: record.data, txid: txId,
  receiverAddr: record.receiverAddr, senderAddr: record.senderAddr});

console.log(item.description);
```

### Create a Seller Profile:
Before you can post items for sale, you'll need to provide some basic info on
how people can message you. Optionally, you may want to set up a nickname.

```js
var Seller = dropzone.messages.Seller;
var privKey = bitcore.PrivateKey.fromWIF('seller-private-mainnet-key-wif-here')

new Seller(connMainnet, {
  description: 'Optional Description',
  alias: 'Satoshi Nakatoto',
  receiverAddr: privKey.toAddress(this.network).toString(),
  // NOTE: This is a testnet address, unconnected to your mainnet privKey:
  communicationsAddr: 'n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv'
  }).save(privKey.toWIF(), function (err, seller) {
  if (err) throw err;

  console.log("Created Seller at: "+seller.txid);
})
```

### Create an Item (For retrieval with Listing):
For those who have a transaction already available, and simply want to de-serialize
that transaction into its Drop Zone representation, the code to do so is as
follows:

```js
var Item = dropzone.messages.Item;

new Item(connMainnet, {
  description: 'Item Description',
  priceCurrency: 'BTC',
  priceInUnits: 100000000,
  expirationIn: 6*24*7, // One week.
  latitude: 51.500782, 
  longitude: -0.124669,
  radius: 1000}).save('seller-private-key-wif-here', function (err, item) {
  if (err) throw err;

  console.log("Created Item at: "+item.txid);
})
```

### Update the Item (For retrieval with Listing):
If you want to update your listing, it's pretty easy to do. Check it out player:

```js
var Item = dropzone.messages.Item;
var itemCreateTxid = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb';
var sellerAddr = '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod'

new Item(connMainnet, {
  createTxid: itemCreateTxid,
  receiverAddr: senderAddr, 
  description: 'New & Updated Item Description',
  }).save('seller-private-key-wif-here', function (err, item) {
  if (err) throw err

  console.log("Item Update: "+item.txid);
})
```

### Create an Invoice
To create an invoice, as a seller:

```js
var Invoice = dropzone.messages.Invoice;
var buyerAddress = '14zBTbnhzHjdAKkaR4J9kCPiyVyNoaqoti'; // A mainnet addess, Negotiated over testnet.

new Invoice(connMainnet, { 
  expirationIn: 6,
  amountDue: 100000000,
  receiverAddr: buyerAddress 
  }).save('seller-private-key-wif-here', function (err, invoice) {
  if (err) throw err;

  console.log("Created Invoice at: "+invoice.txid);
})
```

### Create an Payment (aka a 'Product Review'):
For a buyer who has received an item, and wishes to review it

```js
var Payment = dropzone.messages.Payment;
var sellerAddress = '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod';

new Payment(connMainnet, { 
  description: 'High Quality, no issues',
  // Quality attributes must be integers gte 0 and lte 8:
  deliveryQuality: 8,
  productQuality: 8, 
  communicationsQuality: 8,
  receiverAddr: sellerAddress
  }).save('seller-private-key-wif-here', function (err, payment) {
  if (err) throw err;

  console.log("Created Payment/Review at: "+payment.txid);
})
```

## Messaging over Testnet
In Drop Zone, negotiations between sellers and buyers is performed over the
bitcoin testnet. Why testnet? 
- Well, it's cheap. 
- And, there's no need to preserve the contents of communications for very long. 
  (In fact the mempool is often enough)
- testnet offers a pretty excellent queueing system, that doesn't require running
  a server, and that persists even when your client isn't running.
- It's *really* easy to work with if you're already using this library anyways.
- It should be trivial for mobile bitcoin wallets to support in the future.

### Initiate a message (Generally By a buyer):
For a buyer who wishes to communicate with a seller, they must first send a
key-negotiation/initialization request:

```js
// This code is running from the buyer's web browser:
var sellerTestnetAddr = 'mi37WkBomHJpUghCn7Vgh3ah33h6L9Nkqw';

// Save this for as long as you need to converse!
// (And kindly throw it away when you're done conversing.)
// NOTE: The conversation key has nothing to do with the bitcoin key.
var buyerConversationPrivkey = crypto.randomBytes(128); 

var buyerToSeller = new Session(connTestnet, 'buyer-testnet-private-key-wif',
  buyerConversationPrivkey, {receiverAddr: sellerTestnetAddr});

// This authenticate() message sends a transaction to the seller that allows
// the buyer to compute the shared symmKey through DH:
buyerToSeller.authenticate(function (err, chatInit) {
  if (err) throw err;
  console.log("Buyer initiated a connection via transaction: "+chatInit.txid);
})
```

### Authenticating a message initiation request:
The seller can list sessions (authenticated or otherwise) using the Seller.all
method. In this example, we'll assume the initiation request was the first 
session in this list, and authenticate it.

```js
// This code is running from the seller's web browser:
Session.all(connTestnet, sellerTestnetAddr, function (err, sessions) {
  if (err) throw err;

  console.log("We found "+sessions.length+" sessions");

  var sellerConversationPrivkey = crypto.randomBytes(128); 

  var sellerToBuyer = new Session(connTestnet,
    'seller-testnet-private-key-wif', sellerConversationPrivkey,
    {withChat: sessions[0]});

  // This authenticate() message sends a transaction to the buyer that allows
  // the buyer to compute the shared symmKey through DH:
  sellerToBuyer.authenticate(function (err, chatAuth) {
    if (err) throw err;
    console.log("Session authenticated via the transaction:"+chatAuth.txid);
  });
})
```

### Conversing:
Once authenticated, on either the seller or buyer's browser, a message can be
communicated via the send() method of their Session object:
```js
sellerToBuyer.send('Hello Buyer, what you need bro?', function(err, bitcoinTx) {
  // Standard callback here..
} )
```

## License

Code released under [the MIT license](https://github.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/blob/master/LICENSE).

Copyright 2015 Miracle Max
