/**
 * Module dependencies.
 */
var EventEmitter = require('events').EventEmitter
  , amqp = require('amqp')
  , util = require('util')
  , Message = require('./message')
  , NoQueueError = require('./errors/noqueueerror')
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


/**
 * Connect to AMQP server.
 *
 * For AMQP buses, `options` argument should be an object that specifies the
 * following parameters:
 *
 *   - `port`  port the client should connect to, defaults to 5672
 *   - `host`  host the client should connect to, defaults to localhost
 *
 * Examples:
 *
 *     bus.connect({ host: '127.0.0.1', port: 5672 }, function() {
 *       console.log('ready');
 *     });
 *
 *     bus.connect({ host: '127.0.0.1', port: 5672, exchange: 'amq.fanout' }, function() {
 *       console.log('ready');
 *     });
 *
 *     bus.connect({ host: '127.0.0.1', port: 5672,
 *                   exchange: {
 *                     name: 'app1.topic',
 *                     options: { type: 'topic', confirm: false }
 *                   } },
 *       function() {
 *         console.log('ready');
 *       });
 *
 * @param {Object} options
 * @param {Function} readyListener
 * @api public
 */
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
        // TODO: Automatically generate unique queue name.
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
          self._subscribe(qopts, function(err) {
            if (err) { return self.emit('error', err); }
            return self.emit('ready');
          });
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

/**
 * Broadcast a message on the bus.
 *
 * In AMQP, publishing a message to an exchange has the effect of enqueuing that
 * message on all queues that are bound to the exchange with a routing key that
 * matches the topic.
 *
 * Examples:
 *
 *     bus.publish('events/on', { timestamp: 0 }, function(err) {
 *       if (err) { throw err; }
 *       ...
 *     });
 *
 *     bus.publish('events/off', { timestamp: 256 });
 *
 * @param {String} topic
 * @param {Mixed} msg
 * @param {Object} options
 * @param {Function} cb
 * @api public
 */
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
    debug('publish %s (confirm)', topic);
    this._exchange.publish(topic, msg, options, function(hadError, err) {
      if (hadError) {
        err = err || new Error('Failed to publish message to topic "' + topic + '"');
        return cb(err);
      }
      return cb();
    });
  } else {
    debug('publish %s', topic);
    this._exchange.publish(topic, msg, options);
    if (cb) { return process.nextTick(cb); }
  }
}

/**
 * Subscribe to messages of `topic` broadcast on the bus.
 *
 * Once subscribed, messages will be delivered and emitted in `message` events.
 * An Antenna application can be registered as a listener for these events,
 * allowing listener processes to be developed in a style similar to that of
 * Express applications.
 *
 * Examples:
 *
 *     bus.subscribe('events/on', function(err) {
 *       if (err) { throw err; }
 *       ...
 *     });
 *
 * @param {String} queue
 * @param {Object} options
 * @param {Function} cb
 * @api public
 */
Bus.prototype.subscribe = function(topic, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }
  options = options || {};
  
  if (!this._queue) { return cb(new NoQueueError('Bus not in listening mode')); }
  
  // AMQP uses period ('.') separators rather than slash ('/')
  topic = topic.replace(/\//g, '.');
  
  var q = this._queue
    , exchange = this._exchange.name;
  
  var onError = function(err) {
    return cb(err);
  };
  
  debug('bind %s %s %s', q.name, exchange, topic);
  q.bind(exchange, topic, function(q) {
    q.removeListener('error', onError);
    return cb();
  });
  
  // NOTE: This will occur if an attempt is made to bind to an exchange that
  //       does not exist.
  //
  //       For example, the underlying `amqp` emits an error with the following
  //       properties:
  //         - message: NOT_FOUND - no exchange 'foo' in vhost '/'
  //         - code: 404
  q.once('error', onError);
}

/**
 * Subscribe to internal queue.
 *
 * @param {Object} options
 * @param {Function} cb
 * @api private
 */
Bus.prototype._subscribe = function(options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }
  options = options || {};
  
  var self = this
    , q = this._queue;
    
  var onError = function(err) {
    return cb(err);
  };
    
  debug('subscribe %s', q.name);
  q.subscribe(options, function(message, headers, deliveryInfo) {
    var m = new Message(message, headers, deliveryInfo);
    self.emit('message', m);
  }).addCallback(function(ok) {
    // This callback is invoked when the subscription was successful, and is
    // equivalent to the registering a listener for the queue's `basicConsumeOk`
    // event.
    q.removeListener('error', onError);
    return cb();
  }).addErrback(function(err) {
    // NOTE: Promise errbacks are not properly invoked by the underlying `amqp`
    //       module.  As a workaround, a listener is explicitly registered for
    //       the queue's `error` event.
  });
  
  // NOTE: This will occur if an attempt is made to subscribe to a queue that
  //       already has an exclusive subscription.
  //
  //       For example, the underlying `amqp` emits an error with the following
  //       properties:
  //         - message: ACCESS_REFUSED - queue 'foo' in vhost '/' in exclusive
  //                    use
  //         - code: 403
  q.once('error', onError);
}


/**
 * Expose `Bus`.
 */
module.exports = Bus;
