/* global describe, it, expect */

var amqp = require('..');

describe('antenna-amqp', function() {
  
  it('should export functions', function() {
    expect(amqp.createBus).to.be.a('function');
  });
  
  it('should export constructors', function() {
    expect(amqp.Bus).to.be.a('function');
  });
  
});
