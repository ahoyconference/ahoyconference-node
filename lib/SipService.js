const zmq = require('zeromq');
const Uuid = require('node-uuid');

function SipService(config, conferenceService, mediaEngine) {
  const self = this;
  self.config = config;
  self.identity = 'T-' + Uuid.v4();
  self.requestCallbacks = {};
  self.sipRegistrations = {};
  self.sipCalls = {};
  self.conferenceService = conferenceService;
  self.mediaEngine = mediaEngine;
}

SipService.prototype.start = function() {
  const self = this;

  self.subSocket = zmq.socket('sub');
  self.subSocket.connect(self.config.messageBus.subscriptionUri);
  self.subSocket.on('message', function(to, from, timestamp, message) {
    to = to.toString();
    message = message.toString();
    try {
      const json = JSON.parse(message);
      self.handleMessage(json, from);
    } catch (error) {
      console.log('error', error);
    }
  });
  self.subSocket.subscribe(self.identity);

  self.messageSocket = zmq.socket('dealer');
  self.messageSocket.connect(self.config.messageBus.messageUri);

  setTimeout(function() {
    self.registerSipTrunks();
  }, 2000);
}

SipService.prototype.registerSipTrunk = function(conference) {
  const self = this;
  if (conference.sip) {
    self.register(conference.sip, function(response) {
      if (response && response.success && response.registration) {
        conference.sip.registrationId = response.registration.id;
        console.log('SipService.registerSipTrunk: registered id ' + conference.sip.registrationId + " for conference " + conference.id);
        self.subSocket.subscribe(response.address);
      }
    });
  }
}

SipService.prototype.registerSipTrunks = function() {
  const self = this;
  // register SIP trunk for each conference that supports sip
  self.conferenceService.forEachConference(function(conference) {
    self.registerSipTrunk(conference);
  });
}

SipService.prototype.sendMessage = function(message, destination) {
  const self = this;
  self.messageSocket.send([destination, self.identity, Date.now(), JSON.stringify(message)]);
}

SipService.prototype.sendRequest = function(request, uuid, destination, requestCallback) {
  const self = this;
    if (requestCallback) {
      self.requestCallbacks[uuid] = requestCallback;
    }
    self.sendMessage(request, destination);
}

SipService.prototype.sendSipRequest = function(request, uuid, callback) {
  const self = this;
  self.sendRequest( { sip: request }, uuid, "ZMQ2SIP", callback );
}

SipService.prototype.sendWebRtcRequest = function(request, uuid, destination, callback) {
  const self = this;
  self.sendRequest( { webrtc: request }, uuid, destination, callback);
}

SipService.prototype.sendWebRtcResponse = function(response, destination) {
  const self = this;
  self.sendMessage( { webrtc: response }, destination );
}

SipService.prototype.handleMessage = function(msg, from) {
  const self = this;
  if (msg.sip) {
    self.handleSip(msg.sip, from);
  }
  if (msg.webrtc) {
    self.handleWebRtc(msg.webrtc, from);
  }
}

SipService.prototype.handleSip = function(msg, from) {
  const self = this;
  let uuid = null;
  let callback = null;
  if (msg.registerResponse) {
    uuid = msg.registerResponse.uuid;
    callback = self.requestCallbacks[uuid];
    delete self.requestCallbacks[uuid];
    callback(msg.registerResponse);
  } else if (msg.registerError && msg.registerError.registration) {
    if (msg.registerError.error && msg.registerError.error.code) {
      const registrationId = msg.registerError.registration.id;
      const conference = self.conferenceService.getConferenceByRegistrationId(registrationId)
      if (conference && conference.sip) {
        delete conference.sip.registrationId;
        setTimeout(function() {
          self.registerSipTrunk(conference);
        }, 5000);
      }
    }
  }
}

SipService.prototype.register = function(trunk, callback) {
  const self = this;
  const uuid = Uuid.v4();
  const request = {
    registerRequest: trunk
  };
  request.registerRequest.uuid = uuid;
  request.registerRequest.refresh = 60;
//  request.registerRequest.address = self.identity;
  self.sendSipRequest(request, uuid, callback);
}

SipService.prototype.handleWebRtc = function(msg, from) {
  const self = this;
//  console.log('handleWebRtc', msg);
  if (msg.sessionOffer) {
    if (msg.sessionOffer.sip && msg.sessionOffer.sip.registrationId) {
      const conference = self.conferenceService.getConferenceByRegistrationId(msg.sessionOffer.sip.registrationId);
      if (conference) {
        console.log('incoming call from ' + msg.sessionOffer.sip.callingPartyNumber + ' for conference ' + conference.id);
        const call = {
          conference: conference,
          uuid: msg.sessionOffer.uuid,
          callingPartyNumber: msg.sessionOffer.sip.callingPartyNumber
        };
        self.sipCalls[call.uuid] = call;
        if (conference.sipConferenceId) {
          // sip conference does exists already
          const request = {
            webrtc: {
              sessionConferenceJoinRequest: {
                conferenceId: conference.sipConferenceId,
                uuid: call.uuid
              }
            }
          };
          self.sendRequest(request, call.uuid, "ZMQ2SIP", function(response) {
            console.log("response: " + JSON.stringify(response));
            if (response && response.success) {
              console.log('call ' + call.uuid + ' is joining conference ' + conference.id);
            } 
          });
        } else {
          // start a new sip conference
          const uuid = Uuid.v4();
          const request = {
            webrtc: {
              conferenceCreateRequest: {
                sessions: [ call.uuid ],
                voiceActivityDetectionMode: 3,
                uuid: uuid
              }
            }
          };
          self.sendRequest(request, uuid, "ZMQ2SIP", function(response) {
            console.log("response: " + JSON.stringify(response));
            if (response && response.success) {
              conference.sipConferenceId = response.conferenceId;
              console.log('call ' + call.uuid + ' is joining conference ' + conference.id);
            } 
          });
        }
      }
    }
  } else if (msg.sessionCancel) {
    const uuid = msg.sessionCancel.uuid;
    if (self.sipCalls[uuid]) {
      const call = self.sipCalls[uuid];
      console.log('incoming call for conference ' + call.conference.id + ' has been cancelled.');
      delete self.sipCalls[uuid];
    }
  } else if (msg.sessionTerminate) {
    const uuid = msg.sessionTerminate.uuid;
    if (self.sipCalls[uuid]) {
      const call = self.sipCalls[uuid];
      console.log('incoming call for conference ' + call.conference.id + ' has been terminated.');
      delete self.sipCalls[uuid];
    }
  } else if (msg.conferenceCreateResponse) {
    const uuid = msg.conferenceCreateResponse.uuid;
    const callback = self.requestCallbacks[uuid];
    if (callback) {
      delete self.requestCallbacks[uuid];
      callback(msg.conferenceCreateResponse);
    }
  } else if (msg.sessionConferenceJoin) {
    const uuid = msg.sessionConferenceJoin.uuid;
    const conferenceId = msg.sessionConferenceJoin.conferenceId;
    const rtpEndpointId = msg.sessionConferenceJoin.rtpEndpointId;
    const rtpMixerId = msg.sessionConferenceJoin.rtpMixerId;
    const conference = self.conferenceService.getConferenceBySipConferenceId(conferenceId);
    const call = self.sipCalls[uuid];
    if (call && conference) {
      call.member = { webrtc: false, uuid: Uuid.v4(), moderator: false, streams: { } };
      call.member.name = '+' + call.callingPartyNumber;
      call.member.conferenceId = conference.id;
      self.conferenceService.onMemberJoin(conference, call.member);

      const stream = { name: 'telephone', audio: true, video: false, uuid: Uuid.v4(), rxRtpEndpointId: rtpEndpointId, rtpMixerId: rtpMixerId };
      call.member.streams['telephone'] = stream;
      self.conferenceService.onStreamStatus(stream, true, call.member);
      console.log('session ' + uuid + ' has joined conference ' + conference.id + ' callingPartyNumber ' + call.callingPartyNumber);
      // add rtp endpoint of each WebRTC participant to this call's rtp mixer
      self.conferenceService.forEachMemberStream(conference, true, function(stream) {
        self.mediaEngine.addRtpMixerSource(rtpMixerId, stream.rxRtpEndpointId,
          function(response) {
            console.log('addRtpMixerSourceResponse', response);
          }
        );
      });
    }
  } else if (msg.sessionConferenceLeave) {
    const uuid = msg.sessionConferenceLeave.uuid;
    const conferenceId = msg.sessionConferenceLeave.conferenceId;
    const conference = self.conferenceService.getConferenceBySipConferenceId(conferenceId);
    const call = self.sipCalls[uuid];
    if (call && conference) {
      if (call.member.streams['telephone']) {
        self.conferenceService.onStreamStatus(call.member.streams['telephone'], false, call.member);
        call.member.streams = {};
      }
      self.conferenceService.onMemberLeave(conference, call.member);
      delete call.member;
    }
  }
}

SipService.prototype.stop = function() {
  const self = this;
  self.messageSocket.close();
  self.messageSocket = null;
  self.subSocket.close();
  self.subSocket = null;
}

module.exports = SipService;
