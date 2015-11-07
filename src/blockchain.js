var drivers = require('./drivers')

var blockchain = {
  use: function (nextDriver, options) {
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
    if (options) {
      for (key in options) {
        exports[key] = options[key]
      }
    }
  }
}

for (var key in blockchain) {
  exports[key] = blockchain[key]
}
