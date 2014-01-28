var EventEmitter = require('events').EventEmitter
  , amqp = require('amqp')
  , util = require('util')
  , Message = require('./message')

var NONPERSISTENT_MODE = 1;
var PERSISTENT_MODE = 2;


/**
 * `Bus` constructor.
 *
 * @api public
 */
function Bus() {
  EventEmitter.call(this);
  this._exchange = null;
  this._queue = null;
}

/**
 * Inherit from `EventEmitter`.
 */
util.inherits(Bus, EventEmitter);

Bus.prototype.connect = function(options, readyListener) {
  if (readyListener) { this.on('ready', readyListener); }
  
  var self = this;
  this._connection = amqp.createConnection(options);
  this._connection.once('ready', function() {
    var exchange = options.exchange || 'amq.fanout';

    var name = exchange
      , opts = {};
    if (typeof exchange == 'object') {
      name = exchange.name;
      opts = exchange.options;
    }
    
    // AMQP uses period ('.') separators rather than slash ('/')
    name = name.replace(/\//g, '.');
    
    opts.type = (opts.type === undefined) ? 'fanout' : opts.type;
    self._exchange = self._connection.exchange(name, opts, function(err) {
      var queue = options.queue;
      if (!queue) {
        return self.emit('ready');
      } else {
        var qname = queue
          , qopts = {};
        if (typeof queue == 'object') {
          qname = queue.name;
          qopts = queue.options;
        }
        
        qopts.exclusive = (qopts.exclusive === undefined) ? true : qopts.exclusive;
        
        var q = self._connection.queue(qname, qopts, function(q) {
          return self.emit('ready');
        });
        self._queue = q;
      }
    });
  });
  
  this._connection.on('error', this.emit.bind(this, 'error'));
}

Bus.prototype.declare = function(name, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }
  options = options || {};
  
  // AMQP uses period ('.') separators rather than slash ('/')
  name = name.replace(/\//g, '.');
  
  options.exclusive = (options.exclusive === undefined) ? true : options.exclusive;
  
  var q = this._connection.queue(name, options, function(q) {
    q.removeListener('error', onQueueDeclareError);
    
    var exchange = options.bind;
    if (exchange) {
      // AMQP uses period ('.') separators rather than slash ('/')
      exchange = exchange.replace(/\//g, '.');
      
      q.bind(exchange, '', function(q) {
        q.removeListener('error', onQueueBindError);
        return cb && cb();
      });
      
      // Listen for events that indicate that the queue failed to be bound.
      var onQueueBindError = function(err) {
        return cb && cb(err);
      };
      q.once('error', onQueueBindError);
    } else {
      return cb && cb();
    }
  });
  this._queues[name] = q;
  
  // Listen for events that indicate that the queue failed to be declared.
  var onQueueDeclareError = function(err) {
    return cb && cb(err);
  };
  q.once('error', onQueueDeclareError);
}

Bus.prototype.broadcast =
Bus.prototype.publish = function(topic, msg, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }
  options = options || {};
  
  // AMQP uses period ('.') separators rather than slash ('/')
  topic = topic.replace(/\//g, '.');
  
  options.deliveryMode = (options.deliveryMode === undefined) ? NONPERSISTENT_MODE : options.deliveryMode;
  
  if (this._exchange.options && this._exchange.options.confirm) {
    this._exchange.publish(topic, msg, options, function(hadError) {
      var err;
      if (hadError) {
        err = new Error('Failed to enqueue task in topic "' + topic + '"');
      }
      return cb(err);
    });
  } else {
    this._exchange.publish(topic, msg, options);
    return cb();
  }
}

Bus.prototype.subscribe = function(topic, options, cb) {
  if (typeof options == 'function') {
    handler = options;
    options = undefined;
  }
  options = options || {};
  
  // AMQP uses period ('.') separators rather than slash ('/')
  topic = topic.replace(/\//g, '.');
  
  var self = this
    , q = this._queues[topic];
  q.subscribe(options, function(message, headers, deliveryInfo) {
    var m = new Message(q, message, headers, deliveryInfo);
    self.emit('message', m);
  });
  
  
  // Listen for events that indicate the subscription has been processed.
  // `basicConsumeOk` is emitted when the subscription is successful.
  // `error` is emitted when the subscription failed.  In practice, this
  // has only been observed when attempting to subscribe to queue that has a
  // previously existing exclusive subscription.
  
  var onBasicConsumeOk = function(args) {
    q.removeListener('error', onBasicConsumeError);
    return cb && cb();
  };
  
  var onBasicConsumeError = function(err) {
    q.removeListener('basicConsumeOk', onBasicConsumeOk);
    return cb && cb(err);
  };
  
  q.once('basicConsumeOk', onBasicConsumeOk);
  q.once('error', onBasicConsumeError);
}


/**
 * Expose `Bus`.
 */
module.exports = Bus;
