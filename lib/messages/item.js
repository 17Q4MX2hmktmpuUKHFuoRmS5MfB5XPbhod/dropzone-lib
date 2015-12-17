var bitcore = require('bitcore-lib')
var extend = require('shallow-extend')
var inherits = require('inherits')
var message = require('./message')
var bigdecimal = require('bigdecimal')

var BigDecimal = bigdecimal.BigDecimal
var MessageBase = message.MessageBase
var Base58 = bitcore.encoding.Base58
var Hash = bitcore.crypto.Hash

var HASH_160_PARTS = /^(?:mfZ|1DZ)([1-9X]{9})([1-9X]{9})([1-9X]{6}).+/

function pad (n, width, z) {
  z = z || '0'
  n = n + ''
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n
}

function isNullOrUndefined (val) {
  return (val === null) || (typeof val === 'undefined')
}

var Item = function Item (connection, attrs) {
  var Super = this.constructor.super_
  Super.call(this, connection, attrs)

  this.__defineGetter__('latitude', function () {
    return (!isNullOrUndefined(attrs.latitude)) ? attrs.latitude
      : this._integerToLatLon(this._addressParts(attrs.receiverAddr, 0))
  })

  this.__defineGetter__('longitude', function () {
    return (!isNullOrUndefined(attrs.longitude)) ? attrs.longitude
    : this._integerToLatLon(this._addressParts(attrs.receiverAddr, 1), 180)
  })

  this.__defineGetter__('radius', function () {
    return (!isNullOrUndefined(attrs.radius)) ? attrs.radius
      : this._addressParts(attrs.receiverAddr, 2)
  })

  /*
   * This is an easy guide to what we're doing here:
   * http://www.reddit.com/r/Bitcoin/comments/2ss3en/calculating_checksum_for_bitcoin_address/
   *
   * NOTE: There was a digit off in the reference spec, this radius is a six
   *       digit number, not an eight digit number.
   */
  this.__defineGetter__('receiverAddr', function () {
    if (attrs.receiverAddr) {
      return attrs.receiverAddr
    } else if (this.createTxid) {
      return this.createTxid
    } else if ([this.latitude, this.longitude, this.radius].every(
      function (el) { return !isNullOrUndefined(el) })) {
      var receiverAddrBase = [ (this.connection.isTesting) ? 'mfZ' : '1DZ',
        pad(this._latlonToInteger(this.latitude), 9),
        pad(this._latlonToInteger(this.longitude, 180), 9),
        pad(Math.abs(this.radius), 6)
       ].join('').replace(/0/g, 'X') + 'XXXXXXX'

      /* The x's pad the checksum component for us to ensure the base conversion
       * produces the correct output. Similarly, we ignore them after the decode:
       */
      var addr = Base58.decode(receiverAddrBase).slice(0, 21)
      var checksum = Hash.sha256(Hash.sha256(addr)).slice(0, 4)

      return Base58.encode(Buffer.concat([addr, checksum]))
    }

    return null
  })
}

inherits(Item, MessageBase)
extend(Item, MessageBase)

extend(Item.prototype, {
  type: 'ITCRTE', // TODO: ITUPDT?
  attrString: {d: 'description', c: 'priceCurrency', t: 'createTxid'},
  attrInt: {p: 'priceInUnits', e: 'expirationIn'},
  schemaFields: {}
})

Item.prototype._addressParts = function (addr, part) {
  var parts = HASH_160_PARTS.exec(addr)
  return (parts && parts.length > 0)
    ? parseInt(parts[part + 1].replace(/X/g, '0'), 10) : null
}

Item.prototype._integerToLatLon = function (latlon, unsignedOffset) {
  if (!unsignedOffset) unsignedOffset = 90

  if (isNullOrUndefined(latlon)) return null

  var bigLatlon = new BigDecimal(latlon)
  var bigMillion = new BigDecimal('1000000')
  var bigOffest = new BigDecimal(String(unsignedOffset))

  return parseFloat(bigLatlon.divide(bigMillion).subtract(bigOffest).toString())
}

Item.prototype._latlonToInteger = function (latlon, unsignedOffset) {
  if (!unsignedOffset) unsignedOffset = 90

  return Math.abs(Math.floor((latlon + unsignedOffset) * 1000000))
}

module.exports = {
  Item: Item
}
