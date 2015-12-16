/* global describe it before afterEach */
/* eslint no-new: 0 */

var chai = require('chai')
var factories = require('../test/factories/factories')

var fakeConnection = require('../lib/drivers/fake')
var messages = require('../lib/messages')
var profile = require('../lib/profile')
var globals = require('./fixtures/globals')

var async = require('async')

var expect = chai.expect
var Seller = messages.Seller

var SellerProfile = profile.SellerProfile

factories.dz(chai)

describe('SellerProfile', function () {
  var connection = null

  before(function (next) {
    connection = new fakeConnection.FakeBitcoinConnection(function (err) {
      if (err) throw err
      next()
    })
  })

  afterEach(function (next) {
    connection.clearTransactions(function (err) {
      if (err) throw err
      next()
    })
  })

  describe('accessors', function () {
    it('compiles a simple profile', function (nextSpec) {
      var profile = new SellerProfile(connection, globals.testerPublicKey)

      expect(profile.addr).to.equal(globals.testerPublicKey)

      async.series([
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey,next)
        },
        function (next) {
          profile.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
            next()
          })
        },
        function (next) {
          profile.getAttributes(null, function(err, attrs) {
            expect(attrs.description).to.equal('abc')
            expect(attrs.alias).to.equal('Satoshi')
            expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(attrs.isActive).to.be.true
            next()
          })
        }
      ], nextSpec)
    })

    it('combines attributes from mulitple messages', function (nextSpec) {
      var profile = new SellerProfile(connection, globals.testerPublicKey)

      async.series([
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        function (next) {
          chai.factory.create('seller', connection,
            {description: 'xyz'}).save(globals.testerPrivateKey, next)
        },
        function (next) {
          profile.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
            next()
          })
        },
        function (next) {
          profile.getAttributes(null, function(err, attrs) {
            expect(attrs.description).to.equal('xyz')
            expect(attrs.alias).to.equal('Satoshi')
            expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(attrs.isActive).to.be.true
            next()
          })
        }
      ], nextSpec)
    })

    it('supports profile transfers', function (nextSpec) {
      var profile

      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Seller Transfer to Tester2:
        function (next) {
          chai.factory.create('seller', connection, {
            transferAddr: globals.tester2PublicKey, 
            receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Update Tester2 for some added complexity:
        function (next) {
          chai.factory.create('seller', connection, {
            alias: 'New Alias', 
            receiverAddr: globals.tester2PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          profile = new SellerProfile(connection, globals.tester2PublicKey)

          profile.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
            next()
          })
        },
        function (next) {
          profile.getAttributes(null, function(err, attrs) {
            expect(attrs.description).to.equal('abc')
            expect(attrs.alias).to.equal('New Alias')
            expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(attrs.addr).to.equal(globals.tester2PublicKey)
            expect(attrs.isActive).to.be.true
            next()
          })
        }
      ], nextSpec)
    })

    it('supports a transfer in and transfer out', function (nextSpec) {
      var profile

      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Seller Transfer to Tester2:
        function (next) {
          chai.factory.create('seller', connection, {
            transferAddr: globals.tester2PublicKey, 
            receiverAddr: globals.tester2PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Tester2 Transfer to Tester 3:
        function (next) {
          chai.factory.create('seller', connection, {
            transferAddr: globals.tester3PublicKey, 
            receiverAddr: globals.tester3PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          profile = new SellerProfile(connection, globals.tester3PublicKey)

          profile.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
            next()
          })
        },
        function (next) {
          profile.getAttributes(null, function(err, attrs) {
            expect(attrs.description).to.equal('abc')
            expect(attrs.alias).to.equal('Satoshi')
            expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(attrs.addr).to.equal(globals.tester3PublicKey)
            expect(attrs.isActive).to.be.true
            next()
          })
        }
      ], nextSpec)
    })

    it('only supports a single transfer in', function (nextSpec) {
      var profile

      async.series([
        // Address 1 Declaration:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Address 2 Declaration:
        function (next) {
          new Seller(connection, {description: 'xyz', alias: 'New Alias',
           receiverAddr: globals.tester2PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        // Address 1 transfers to Address 3:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester3PublicKey,
           receiverAddr: globals.tester3PublicKey
          }).save(globals.testerPrivateKey, next)
        },
        // Address 2 transfers to Address 3:
        function (next) {
          new Seller(connection, {transferAddr: globals.tester3PublicKey,
           receiverAddr: globals.tester3PublicKey
          }).save(globals.tester2PrivateKey, next)
        },
        function (next) {
          profile = new SellerProfile(connection, globals.tester3PublicKey)

          profile.isValid(function (err, res) {
            if (err) throw err
            expect(res).to.be.null
            next()
          })
        },
        function(next) {
          profile.getAttributes(null, function(err, attrs) {
            expect(attrs.description).to.equal('abc')
            expect(attrs.alias).to.equal('Satoshi')
            expect(attrs.communicationsAddr).to.equal('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
            expect(attrs.addr).to.equal(globals.tester3PublicKey)
            expect(attrs.transferAddr).to.be.nil
            expect(attrs.isActive).to.be.true
            next()
          })
        }
      ], nextSpec)
    })

    it('supports deactivation', function (nextSpec) {
      async.series([
        // Standard Seller:
        function (next) {
          chai.factory.create('seller',
            connection).save(globals.testerPrivateKey, next)
        },
        // Seller Deactivates his account:
        function (next) {
          new Seller(connection, {receiverAddr: globals.testerPublicKey,
            transferAddr: 0 }).save(globals.testerPrivateKey, next)
        },
        function(next) {
          var profile = new SellerProfile(connection, globals.testerPublicKey)

          profile.getAttributes(null, function(err, attrs) {
            expect(attrs.transferAddr).to.equal(0)
            expect(attrs.isActive).to.be.false
            expect(attrs.isClosed).to.be.true
            next()
          })
        }
      ], nextSpec)

    })

  })
/*
  describe "accessors" do

    it "supports deactivation" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Seller Deactivates his account:
      Dropzone::Seller.new( receiver_addr: test_pubkey,
        transfer_pkey: 0).save! test_privkey

      profile = Dropzone::SellerProfile.new test_pubkey

      expect(profile.transfer_pkey).to eq(0)
      expect(profile.active?).to be_falsey
      expect(profile.closed?).to be_truthy
    end

    it "will stop merging attributes after a transfer out" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 transfers to Address 2:
      Dropzone::Seller.new( receiver_addr: TESTER2_PUBLIC_KEY,
        transfer_pkey: TESTER2_PUBLIC_KEY).save! test_privkey

      # Address 1 changes description:
      Dropzone::Seller.new( description: 'xyz' ).save! test_privkey

      profile1 = Dropzone::SellerProfile.new test_pubkey
      profile2 = Dropzone::SellerProfile.new TESTER2_PUBLIC_KEY

      expect(profile1.description).to eq("abc")
      expect(profile1.alias).to eq("Satoshi")
      expect(profile1.communications_pkey).to eq('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
      expect(profile1.addr).to eq(test_pubkey)
      expect(profile1.transfer_pkey).to eq(TESTER2_PUBLIC_KEY)
      expect(profile1.active?).to be_falsey
      expect(profile1.closed?).to be_falsey

      expect(profile2.description).to eq("abc")
      expect(profile2.alias).to eq("Satoshi")
      expect(profile2.communications_pkey).to eq('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
      expect(profile2.addr).to eq(TESTER2_PUBLIC_KEY)
      expect(profile2.active?).to be_truthy
      expect(profile2.closed?).to be_falsey
    end

    it "will stop merging attributes after a cancellation" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 closes its account:
      Dropzone::Seller.new( receiver_addr: test_pubkey,
        transfer_pkey: 0 ).save! test_privkey

      # Address 1 changes description:
      Dropzone::Seller.new( description: 'xyz' ).save! test_privkey

      profile = Dropzone::SellerProfile.new test_pubkey

      expect(profile.valid?).to be_truthy
      expect(profile.description).to eq("abc")
      expect(profile.alias).to eq("Satoshi")
      expect(profile.communications_pkey).to eq('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
      expect(profile.addr).to eq(test_pubkey)
      expect(profile.transfer_pkey).to eq(0)
      expect(profile.active?).to be_falsey
    end

    it "will merge attributes in a cancellation message" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 closes its account:
      Dropzone::Seller.new( receiver_addr: test_pubkey, description: 'xyz',
        transfer_pkey: 0 ).save! test_privkey

      profile = Dropzone::SellerProfile.new test_pubkey

      expect(profile.valid?).to be_truthy
      expect(profile.description).to eq("xyz")
      expect(profile.alias).to eq("Satoshi")
      expect(profile.communications_pkey).to eq('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
      expect(profile.addr).to eq(test_pubkey)
      expect(profile.transfer_pkey).to eq(0)
      expect(profile.active?).to be_falsey
    end

    it "will merge attributes in a transfer message" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 closes its account:
      Dropzone::Seller.new( receiver_addr: TESTER2_PUBLIC_KEY, description: 'xyz',
        transfer_pkey: TESTER2_PUBLIC_KEY ).save! test_privkey

      profile = Dropzone::SellerProfile.new test_pubkey

      expect(profile.valid?).to be_truthy
      expect(profile.description).to eq("xyz")
      expect(profile.alias).to eq("Satoshi")
      expect(profile.communications_pkey).to eq('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
      expect(profile.addr).to eq(test_pubkey)
      expect(profile.transfer_pkey).to eq(TESTER2_PUBLIC_KEY)
      expect(profile.active?).to be_falsey
    end

    it "won't compile a deactivated transfer" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 closes its account:
      Dropzone::Seller.new( receiver_addr: test_pubkey,
        transfer_pkey: 0 ).save! test_privkey

      # Address 1 transfers its account:
      Dropzone::Seller.new( receiver_addr: TESTER2_PUBLIC_KEY,
        transfer_pkey: TESTER2_PUBLIC_KEY ).save! test_privkey

      profile = Dropzone::SellerProfile.new TESTER2_PUBLIC_KEY

      expect(profile.valid?).to be_falsey
    end
  end

  describe "validations" do
    after{ clear_blockchain! }

    it "requires a valid seller message" do
      # No messages have been created here yet:
      profile = Dropzone::SellerProfile.new test_pubkey

      expect(profile.valid?).to be_falsey
      expect(profile.errors.count).to eq(1)
      expect(profile.errors.on(:addr)).to eq(['profile not found'])
    end

    it "won't accept a closed account transfer" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 closes its account:
      Dropzone::Seller.new( receiver_addr: test_pubkey,
        transfer_pkey: 0 ).save! test_privkey

      # Address 1 transfers its account:
      Dropzone::Seller.new( receiver_addr: TESTER2_PUBLIC_KEY,
        transfer_pkey: TESTER2_PUBLIC_KEY ).save! test_privkey

      profile = Dropzone::SellerProfile.new TESTER2_PUBLIC_KEY
      expect(profile.valid?).to be_falsey
      expect(profile.errors.count).to eq(1)
      expect(profile.errors.on(:prior_profile)).to eq(['invalid transfer or closed'])
    end

    it "won't accept a second transfer out" do
      # Standard Seller:
      Dropzone::Seller.sham!(:build).save! test_privkey

      # Address 1 transfers to address 2:
      Dropzone::Seller.new( receiver_addr: TESTER2_PUBLIC_KEY,
        transfer_pkey: TESTER2_PUBLIC_KEY ).save! test_privkey

      # Address 1 transfers to address 3:
      Dropzone::Seller.new( receiver_addr: TESTER3_PUBLIC_KEY,
        transfer_pkey: TESTER3_PUBLIC_KEY ).save! test_privkey

      profile2 = Dropzone::SellerProfile.new TESTER2_PUBLIC_KEY
      profile3 = Dropzone::SellerProfile.new TESTER3_PUBLIC_KEY

      expect(profile2.valid?).to be_truthy
      expect(profile2.description).to eq("abc")
      expect(profile2.alias).to eq("Satoshi")
      expect(profile2.communications_pkey).to eq('n3EMs5L3sHcZqRy35cmoPFgw5AzAtWSDUv')
      expect(profile2.addr).to eq(TESTER2_PUBLIC_KEY)
      expect(profile2.active?).to be_truthy

      expect(profile3.valid?).to be_falsey
      expect(profile3.errors.count).to eq(1)
      expect(profile3.errors.on(:prior_profile)).to eq(['invalid transfer or closed'])
    end

  end
*/
})
