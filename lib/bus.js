/**
 * Module dependencies.
 */
var EventEmitter = require('events').EventEmitter
  , amqp = require('amqp')
  , util = require('util')
  , Message = require('./message')
  , debug = require('debug')('antenna-amqp');

/**
 * Message delivery mode constants.
 */
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
  if (readyListener) { this.once('ready', readyListener); }
  
  debug('connecting %s:%s', options.host || 'localhost', options.port || 5672);
  
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
    if (name.indexOf('amq.') !== 0) {
      opts.type = (opts.type === undefined) ? 'fanout' : opts.type;
    } else {
      // Options for built-in exchanges can not be overridden.
      opts = {};
    }
    
    debug('exchange %s', name);
    self._exchange = self._connection.exchange(name, opts, function(exchange) {
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
        
        
        var onQueueError = function(err) {
          return self.emit('error', err);
        };
        
        debug('queue %s', qname);
        var q = self._connection.queue(qname, qopts, function(q) {
          q.removeListener('error', onQueueError);
          self._subscribe(qopts);
        });
        self._queue = q;
        
        q.once('error', onQueueError);
      }
    });
    self._exchange.on('error', function(err) {
      // NOTE: This will occur if an exchange is redeclared with different
      //       properties.
      //
      //       For example, the underlying `amqp` emits an error with the
      //       following properties:
      //         - message: PRECONDITION_FAILED - cannot redeclare exchange
      //                    'foo' in vhost '/' with different type, durable,
      //                    internal or autodelete value
      //         - code: 406
      return self.emit('error', err);
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
        err = new Error('Failed to publish message to topic "' + topic + '"');
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
    cb = options;
    options = undefined;
  }
  options = options || {};
  
  // AMQP uses period ('.') separators rather than slash ('/')
  topic = topic.replace(/\//g, '.');
  
  // AMQP uses period ('.') separators rather than slash ('/')
  var exchange = this._exchange.name.replace(/\//g, '.');
  
  var q = this._queue;
  q.bind(exchange, topic, function(q) {
    q.removeListener('error', onQueueBindError);
    return cb && cb();
  });
  
  // Listen for events that indicate that the queue failed to be bound.
  var onQueueBindError = function(err) {
    return cb && cb(err);
  };
  q.once('error', onQueueBindError);
}

Bus.prototype._subscribe = function(options) {
  options = options || {};
  
  var self = this
    , q = this._queue;
  q.subscribe(options, function(message, headers, deliveryInfo) {
    var m = new Message(message, headers, deliveryInfo);
    self.emit('message', m);
  });
  
  
  // Listen for events that indicate the subscription has been processed.
  // `basicConsumeOk` is emitted when the subscription is successful.
  // `error` is emitted when the subscription failed.  In practice, this
  // has only been observed when attempting to subscribe to queue that has a
  // previously existing exclusive subscription.
  
  var onBasicConsumeOk = function(args) {
    q.removeListener('error', onBasicConsumeError);
    return self.emit('ready');
  };
  
  var onBasicConsumeError = function(err) {
    q.removeListener('basicConsumeOk', onBasicConsumeOk);
  };
  
  q.once('basicConsumeOk', onBasicConsumeOk);
  q.once('error', onBasicConsumeError);
}


/**
 * Expose `Bus`.
 */
module.exports = Bus;
