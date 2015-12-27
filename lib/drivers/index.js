var spv = require('./spv')
var fakeChain = require('./fake_chain')
var blockchainDotInfo = require('./blockchain_dot_info')

module.exports = {
  spv: spv, // TODO: Export the classname here
  FakeChain: fakeChain.FakeChain,
  BlockchainDotInfo: blockchainDotInfo.BlockchainDotInfo
}

