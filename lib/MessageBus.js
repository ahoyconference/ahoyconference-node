const zmq = require('zeromq');

function MessageBus(config) {
  const self = this;
  self.config = config;
}

MessageBus.prototype.start = function() {
  const self = this;

  self.pubSocket = zmq.socket('pub');
  self.pubSocket.bindSync(self.config.subscriptionUri);

  self.routerSocket = zmq.socket('router');
  self.routerSocket.bindSync(self.config.messageUri);
  self.routerSocket.on('message', function(address, to, from, timestamp, message) {
    self.pubSocket.send([to, from, timestamp, message]);
  });
}

MessageBus.prototype.stop = function() {
  const self = this;
  self.routerSocket.close();
  self.routerSocket = null;
  self.pubSocket.close();
  self.pubSocket = null;
}

MessageBus.prototype.publishConferenceEvent = function(conferenceId, event, data) {
  const self = this;
  // console.log('MessageBus.publishConferenceEvent: ' + conferenceId + ' => ' + event , data);
  self.pubSocket.send(['conference_' + conferenceId  + '|' + event, 'ConferenceService', Date.now(), JSON.stringify(data)]);
}

module.exports = MessageBus;
