var spv = require('./spv')
var fake = require('./fake')

var drivers = {
  load: function (name) {
    return drivers[name] || spv
  },
  spv: spv,
  fake: fake
}

module.exports = drivers
