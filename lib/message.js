/**
 * `Message` constructor.
 *
 * @api protected
 */
function Message(message, headers, deliveryInfo) {
  // Antenna uses slash ('/') separators rather than period ('.')
  this.topic = deliveryInfo.routingKey.replace(/\./g, '/');
  this.headers = {};
  if (deliveryInfo.contentType) { headers['content-type'] = deliveryInfo.contentType; }
  // TODO: only set body if it has been parsed, otherwise set `data`
  this.body = message;
}


/**
 * Expose `Message`.
 */
module.exports = Message;
