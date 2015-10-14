var drivers = require('./drivers')

var blockchain = {
  use: function (nextDriver) {
    if (typeof nextDriver === 'string') {
      nextDriver = drivers.load(nextDriver)
    }
    var key
    for (key in exports) {
      if (!(key in blockchain)) {
        delete exports[key]
      }
    }
    for (key in nextDriver) {
      exports[key] = nextDriver[key]
    }
  }
}

for (var key in blockchain) {
  exports[key] = blockchain[key]
}
