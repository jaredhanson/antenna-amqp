# antenna-amqp

[![Build](https://travis-ci.org/jaredhanson/antenna-amqp.png)](https://travis-ci.org/jaredhanson/antenna-amqp)
[![Coverage](https://coveralls.io/repos/jaredhanson/antenna-amqp/badge.png)](https://coveralls.io/r/jaredhanson/antenna-amqp)
[![Quality](https://codeclimate.com/github/jaredhanson/antenna-amqp.png)](https://codeclimate.com/github/jaredhanson/antenna-amqp)
[![Dependencies](https://david-dm.org/jaredhanson/antenna-amqp.png)](https://david-dm.org/jaredhanson/antenna-amqp)
[![Tips](http://img.shields.io/gittip/jaredhanson.png)](https://www.gittip.com/jaredhanson/)


This module provides an [AMQP](http://www.amqp.org/) 0-9-1 adapter for
[Antenna](https://github.com/jaredhanson/antenna).  AMQP 0-9-1 is implemented by
popular messages brokers such as [RabbitMQ](https://www.rabbitmq.com/).

## Install

    $ npm install antenna-amqp

## Usage

#### Connect to Message Bus

    var amqp = require('antenna-amqp');
    var bus = new amqp.Bus();
    
    bus.connect({ host: 'localhost', port: 5672 }, function() {
      console.log('connected!');
    });
    
#### Dispatch Messages to Application

    var antenna = require('antenna');
    var app = antenna();
    
    bus.on('message', app);
    
    bus.subscribe('events/on', function(err) {
      if (err) { throw err; }
      console.log('subscribed to topic!');
    });

#### Publish Messages

    bus.publish('events/on', { time: Date.now() }, function(err) {
      if (err) { throw err; }
      console.log('published message!');
    });

## Tests

    $ npm install
    $ make test

## Credits

  - [Jared Hanson](http://github.com/jaredhanson)

## License

[The MIT License](http://opensource.org/licenses/MIT)

Copyright (c) 2014 Jared Hanson <[http://jaredhanson.net/](http://jaredhanson.net/)>
