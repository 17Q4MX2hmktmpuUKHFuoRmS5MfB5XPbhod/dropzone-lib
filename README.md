# dropzone-lib ![Drop Zone](https://raw.githubusercontent.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/master/dropzone-logo-32x32.png)
[![NPM Package](https://img.shields.io/npm/v/dropzone-lib.svg?style=flat-square)](https://www.npmjs.org/package/dropzone-lib)
[![Build Status](https://img.shields.io/travis/ScroogeMcDuckButWithBitcoin/dropzone-lib.svg?branch=master&style=flat-square)](https://travis-ci.org/ScroogeMcDuckButWithBitcoin/dropzone-lib)

An Anonymous Peer-To-Peer Local Contraband Marketplace built with Bitcoin.

* [Start By Reading the White Paper](https://github.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/blob/master/Drop%20Zone%20-%20Whitepaper.pdf) (it's not too technical)
* [Then check out an explorer](http://dropzone.xchain.io/) to see who's posting and what they're buying.
* And then check out the jsdoc for detailed information on how to use this library.

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

NOTE: One glaring exception at the time of writing is the ability to persist 
records on the blockchain.

### Create a Connection/Driver
Unless you plan to feed raw binary data into objects yourself (more on this later)
you're going to want to start by connecting dropzone to a blockchain.

Blockchain connection objects should be created at the inception of your program.
Currently (and let's be real here - all that matters), Bitcoin connections are 
the only supported blockchain connections.

An SPV driver is still being developed, but for the time being, support exists
for the following block explorers, which are queried via http: BlockchainDotInfo,
BlockrIo, Insight, and SoChain. Only Insight andSochain support all functions 
via cors requests, and SoChain is the reccommended driver at this time due to
its speed.

Connections are created like so:

```js
var dropzone = require('dropzone-lib');
var SoChain = dropzone.drivers.SoChain;

connection = new SoChain({}, function(err, soChain){ 
  // Connection initialized...
});
```

### Load a listing from a transaction id
This example loads the Miracle Max bible listing from the blockchain. Note that
"Listings" contain the up-to-date state of an Item, and will reflect the attributes
present in the original listing, plus all modifications to that listing thereafter.

```js
var Listing = dropzone.Listing;

var BIBLE_TXID = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb';

bible = new Listing(connection, BIBLE_TXID);

// Scans the seller's address for the original listing, plus all updates:
bible.getAttributes(function (err, attrs) {
  if (err) throw err;

  console.log(attrs);
});
```

### Load a Seller profile from an address
This example loads the Miracle Max seller profile from the blockchain. Note that
"SellerProfile" contains the up-to-date state of an seller, and will reflect the 
attributes present in the original seller declaration, plus all modifications 
to that declaration thereafter.

```js
var SellerProfile = dropzone.SellerProfile;

var maxProfile = new SellerProfile(connection, '17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod');

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

Invoice.find(connection, INVOICE_TXID, function (err, invoice) {
  console.log(invoice.expirationIn);
  console.log(invoice.amountDue);
  console.log(invoice.receiverAddr);
  console.log(invoice.senderAddr);
});
```

### Load an item from raw transaction hex string
For those who have a transaction already available, and simply want to de-serialize
that transaction into it's Drop Zone representation, the code to do so is as
follows:

```js
var Invoice = dropzone.messages.Invoice;

var txId = '6a9013b8684862e9ccfb527bf8f5ea5eb213e77e3970ff2cd8bbc22beb7cebfb';
var txHex = '01000000017....'; // Be sure to include the entire hex here

var record = new TxDecoder(new Transaction(txHex), {prefix: 'DZ'});

var item = new Item(connection, {data: record.data, txid: txId,
  receiverAddr: record.receiverAddr, senderAddr: record.senderAddr});

console.log(item.description);
```

## License

Code released under [the MIT license](https://github.com/17Q4MX2hmktmpuUKHFuoRmS5MfB5XPbhod/dropzone-lib/blob/master/LICENSE).

Copyright 2015 Miracle Max
