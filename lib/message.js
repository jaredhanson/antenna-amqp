/**
 * `Message` constructor.
 *
 * @api protected
 */
function Message(message, headers, deliveryInfo) {
  // Antenna uses slash ('/') separators rather than period ('.')
  this.topic = deliveryInfo.routingKey.replace(/\./g, '/');
  this.headers = headers;
  if (deliveryInfo.contentType) { this.headers['content-type'] = deliveryInfo.contentType; }
  
  if (Buffer.isBuffer(message.data)) {
    this.data = message.data;
  } else {
    this.body = message;
  }
}


/**
 * Expose `Message`.
 */
module.exports = Message;
