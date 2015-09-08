exports.up = function(next){
  this.addColumn('transactions', {
    blockid: { type: 'text' }
  }, next);
}

exports.down = function(next){
  this.dropColumn('transactions', 'blockid', next);
}
