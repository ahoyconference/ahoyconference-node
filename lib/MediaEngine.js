const WebSocket = require('ws');
const zmq = require('zeromq');
const Uuid = require('node-uuid');

function MediaEngine(config) {
  const self = this;
  self.config = config;
  self.ahoymedCallbacks = {};
  self.ahoymedSocket = null;
  self.ahoymedEventSocket = null;
  self.mediaEventCallback = null;
}

MediaEngine.prototype.setMediaEventCallback = function(callback) {
  const self = this;
  self.mediaEventCallback = callback;
}

MediaEngine.prototype.start = function() {
  const self = this;
  if (self.config.ahoymed.wsUri) {
    self.ahoymedSocket = new WebSocket(self.config.ahoymed.wsUri);
    self.ahoymedSocket.onmessage = function(msg) {
      self.processAhoymedMessage(msg.data);
    }
  } else {
    self.ahoymedSocket = zmq.socket('dealer');
    self.ahoymedSocket.connect(self.config.ahoymed.zmqUri);
    self.ahoymedSocket.on('message', function(message) {
      message = message.toString();
      self.processAhoymedMessage(message);
    })

    self.ahoymedEventSocket = zmq.socket('sub');
    self.ahoymedEventSocket.connect(self.config.ahoymed.zmqEventUri);
    self.ahoymedEventSocket.subscribe('APIEVENT');
    self.ahoymedEventSocket.subscribe('MEDIAEVENT');
    self.ahoymedEventSocket.on('message', function(topic, message) {
      message = message.toString();
      self.processAhoymedEventMessage(message);
    });
  }
}

MediaEngine.prototype.processAhoymedMessage = function(message) {
  const self = this;
  try {
    var json = JSON.parse(message);
    var keys = Object.keys(json);

    keys.forEach(function(key) {
      if (key.toLowerCase().indexOf('response') != -1) {
        var obj = json[key];
        if (self.ahoymedCallbacks[obj.uuid] !== undefined) {
          var msg = {};
          msg[key] = obj;
          self.ahoymedCallbacks[obj.uuid](msg);
          delete self.ahoymedCallbacks[obj.uuid];
        }
      }
    });
  } catch (parseException) {
    console.log(parseException);
  }
}

MediaEngine.prototype.processAhoymedEventMessage = function(message) {
  const self = this;
  try {
    const json = JSON.parse(message);
    if (self.mediaEventCallback) {
      self.mediaEventCallback(json);
    }
  } catch (parseException) {
    console.log(parseException);
  }
}

MediaEngine.prototype.sendMessage = function(message) {
  const self = this;
  self.ahoymedSocket.send(JSON.stringify(message));
}

MediaEngine.prototype.sendRequest = function(request, uuid, requestCallback) {
  const self = this;
    if (requestCallback) {
      self.ahoymedCallbacks[uuid] = requestCallback;
    }
    self.sendMessage(request);
}

MediaEngine.prototype.destroyRtpEndpoint = function(rtpEndpointId, callback) {
  const self = this;
  const uuid = Uuid.v4();
  const message = {
    destroyRtpEndpointRequest: {
      id: rtpEndpointId,
      uuid: uuid
    }
  };
  if (callback) {
    self.ahoymedCallbacks[uuid] = callback;
  }
  self.sendRequest(message, uuid, callback);
}

MediaEngine.prototype.createRtpEndpoint = function(options, callback) {
  const self = this;
  const uuid = Uuid.v4();
  const message = {
    createRtpEndpointRequest: {
      apiContext: options.apiContext,
      localDescription: {
        type: "create",
        sdp: options.sdp
      },
      decodeAudio: ((options.voiceActivityDetectionMode >= 0)?true:false),
      transparentRtcp: true,
      rtcpCheating: options.rtcpCheating,
      voiceActivityDetectionMode: options.voiceActivityDetectionMode,
      uuid: uuid
    }
  };
  self.sendRequest(message, uuid, callback);
}

MediaEngine.prototype.updateRtpEndpoint = function(rtpEndpointId, options, callback) {
  const self = this;
  const uuid = Uuid.v4();
  const message = {
    updateRtpEndpointRequest: {
      id: rtpEndpointId,
      remoteDescription: options.remoteDescription,
      apiContext: options.apiContext,
      sourceId: options.sourceId,
      uuid: uuid
    }
  };
  self.sendRequest(message, uuid, callback);
}

MediaEngine.prototype.addRtpMixerSource = function(rtpMixerId, rtpEndpointId, callback) {
  const self = this;
  const uuid = Uuid.v4();
  const message = {
    addRtpMixerSourceRequest: {
      sourceId: rtpEndpointId,
      id: rtpMixerId,
      uuid: uuid
    }
  };
  self.sendRequest(message, uuid, callback);
}

MediaEngine.prototype.removeRtpMixerSource = function(rtpMixerId, rtpEndpointId, callback) {
  const self = this;
  const uuid = Uuid.v4();
  const message = {
    removeRtpMixerSourceRequest: {
      sourceId: rtpEndpointId,
      id: rtpMixerId,
      uuid: uuid
    }
  };
  self.sendRequest(message, uuid, callback);
}

MediaEngine.prototype.stop = function() {
  const self = this;
  self.ahoymedSocket.close();
  self.ahoymedSocket = null;
  self.ahoymedEventSocket.close();
  self.ahoymedEventSocket = null;
}

module.exports = MediaEngine;
