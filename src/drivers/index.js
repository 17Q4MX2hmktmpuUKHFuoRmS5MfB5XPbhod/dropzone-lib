var spv = require('./spv')

module.exports = {
  load: function (name) {
    return exports[name] || spv
  },
  spv: spv
}
