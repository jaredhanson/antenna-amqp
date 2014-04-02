/**
 * `NoQueueError` error.
 *
 * @api public
 */
function NoQueueError(message) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'NoQueueError';
  this.message = message;
  this.code = 'ENOQUEUE';
}

/**
 * Inherit from `Error`.
 */
NoQueueError.prototype.__proto__ = Error.prototype;


/**
 * Expose `NoQueueError`.
 */
module.exports = NoQueueError;
