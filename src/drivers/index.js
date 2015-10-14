var spv = require('./spv')

var drivers = {
  load: function (name) {
    return drivers[name] || spv
  },
  spv: spv
}

module.exports = drivers
