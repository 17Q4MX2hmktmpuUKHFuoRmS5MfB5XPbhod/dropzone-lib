var spv = require('./spv')
var fakeChain = require('./fake_chain')
var blockchainDotInfo = require('./blockchain_dot_info')
var blockrIo = require('./blockr_io')
var insight = require('./insight')
var soChain = require('./so_chain')

module.exports = {
  spv: spv, // TODO: Export the classname here
  FakeChain: fakeChain.FakeChain,
  BlockchainDotInfo: blockchainDotInfo.BlockchainDotInfo,
  BlockrIo: blockrIo.BlockrIo,
  Insight: insight.Insight,
  SoChain: soChain.SoChain
}
