exports.up = function (next) {
  this.dropTable('txos', next)
}

exports.down = function (next) {
  this.execQuery(
    'CREATE TABLE `txos`' +
    ' (`id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,' +
    ' `txid` TEXT, `spender_addr` TEXT, `index` REAL, `script` BLOB,' +
    ' `satoshis` REAL, `spent` INTEGER UNSIGNED,' +
    ' `is_testing` INTEGER UNSIGNED, `blockid` TEXT,' +
    ' `block_height` INTEGER)', [], next)
}
