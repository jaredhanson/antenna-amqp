/**
 * Module dependencies.
 */
var Bus = require('./bus');


/**
 * Create broker with optional message listener.
 *
 * @param {Function} messageListener
 * @return {Bus}
 * @api public
 */
exports.createBus = function(messageListener) {
  var bus = new Bus();
  if (messageListener) { bus.on('message', messageListener); }
  return bus;
}

/**
 * Export constructors.
 */
exports.Bus = Bus;
