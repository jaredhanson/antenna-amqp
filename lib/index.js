var Bus = require('./bus');

exports.createBus = function(messageListener) {
  var bus = new Bus();
  if (messageListener) { bus.on('message', messageListener); }
  return bus;
}

exports.Bus = Bus;
