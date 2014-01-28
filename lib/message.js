function Message(queue, message, headers, deliveryInfo) {
  // Crane uses slash ('/') separators rather than period ('.')
  this.topic = deliveryInfo.routingKey.replace(/\./g, '/');
  this.headers = {};
  if (deliveryInfo.contentType) { headers['content-type'] = deliveryInfo.contentType; }
  this.body = message;
}


module.exports = Message;
