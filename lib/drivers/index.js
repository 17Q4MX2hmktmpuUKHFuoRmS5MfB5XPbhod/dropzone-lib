var spv = require('./spv')
var fakeChain = require('./fake_chain')
var blockchainDotInfo = require('./blockchain_dot_info')
var blockrIo = require('./blockr_io')

module.exports = {
  spv: spv, // TODO: Export the classname here
  FakeChain: fakeChain.FakeChain,
  BlockchainDotInfo: blockchainDotInfo.BlockchainDotInfo,
  BlockrIo: blockrIo.BlockrIo
}
