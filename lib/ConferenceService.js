const zmq = require('zeromq');
const Uuid = require('node-uuid');
const express = require('express');


function ConferenceService(config, mediaEngine) {
  const self = this;
  self.config = config;
  self.mediaEngine = mediaEngine;
  self.conferences = config.conferences;
  const conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    conference.id = conferenceId;
    conference.members = {};
  });
}

ConferenceService.prototype.start = function() {
  const self = this;
  self.app = express();
  self.http = require('http').createServer(self.app);
  self.app.use('/', express.static('www'));
  self.http.listen(self.config.socketIo.port, function(){
    console.log('listening on *:' + self.config.socketIo.port);
  })

  self.io = require('socket.io')(self.http);
  self.io.on('connection', function(socket) { self.onConnection(socket); });
}

ConferenceService.prototype.forEachConference = function(callback) {
  const self = this;
  let conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    if (conference) {
      let result = callback(conference);
      if (result == true) {
        return;
      }
    }
  });
}

ConferenceService.prototype.getConferenceByDid = function(number) {
  const self = this;
  let conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    if (conference && conference.sip && conference.sip.did && (conference.sip.did == number)) {
      return conference;
    }
  });
  return null;
}

ConferenceService.prototype.getConferenceByRegistrationId = function(registrationId) {
  const self = this;
  let result = null;
  const conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    if (conference && conference.sip && conference.sip.registrationId && (conference.sip.registrationId == registrationId)) {
      result = conference;
    }
  });
  return result;
}

ConferenceService.prototype.getConferenceBySipConferenceId = function(sipConferenceId) {
  const self = this;
  let result = null;
  const conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    if (conference && conference.sipConferenceId && (conference.sipConferenceId == sipConferenceId)) {
      result = conference;
    }
  });
  return result;
}

ConferenceService.prototype.onMemberJoin = function(conference, member) {
  const self = this;
  console.log('member ' + member.name + '(' + member.uuid + ') joined conference ' + conference.id + ', now ' + Object.keys(conference.members).length + ' members');
  self.io.to('conference_' + conference.id).emit('memberJoined', member);
}

ConferenceService.prototype.onMemberLeave = function(conference, member) {
  const self = this;
  if (conference.members[member.uuid]) {
    delete conference.members[member.uuid];
  }
  console.log('member ' + member.name + '(' + member.uuid + ') left conference ' + conference.id + ', now ' + Object.keys(conference.members).length + ' members');
  self.io.to('conference_' + member.conferenceId).emit('memberLeft', member);
  member.streams = {};
  const memberUuids = Object.keys(conference.members);
  let hasSipMembers = false;
  memberUuids.forEach(function(memberUuid) {
    if (conference.members[memberUuid].webrtc == false) {
      hasSipMembers = true;
    }
  });
  if (!hasSipMembers && conference.sipConferenceId) {
    delete conference.sipConferenceId;
  }
}

ConferenceService.prototype.onStreamStatus = function(stream, active, member) {
  const self = this;
  console.log('onStreamStatus: member.conferenceId ' + member.conferenceId);
  self.io.to('conference_' + member.conferenceId).emit('streamStatus', stream, active, member);
}

ConferenceService.prototype.onConnection = function(socket) {
  const self = this;
  const member = { webrtc: true, uuid: Uuid.v4(), audio: false, video: false, moderator: false, streams: {} };

  socket.on('joinConferenceRequest', function(conferenceId, password, name) {
    if (self.conferences[conferenceId]) {
      const conference = self.conferences[conferenceId];
      if (conference.moderatorPassword == password) {
        member.moderator = true;
      }
      if (conference.password && !member.moderator && (conference.password != password)) {
        socket.emit('joinConferenceResponse', false);
        return;
      }
      console.log('joinConference: conferenceId ' + conferenceId + ' password ' + password + ' moderatorPassword ' + conference.moderatorPassword);
      member.name = name;
      member.conferenceId = conferenceId;
      conference.members[member.uuid] = member;
      socket.emit('joinConferenceResponse', true, conference.members, member);
      self.onMemberJoin(conference, member);
      socket.join('conference_' + conferenceId);
    }
  })

  // a client wants to start streaming its local media
  socket.on('publishStream', function(name, audio, video) {
    const conference = self.conferences[member.conferenceId];
    if (conference) {
      const stream = { name: name, audio: audio, video: video, uuid: Uuid.v4() };
      if (audio || video) {
        // create a RTP endpoint to receive audio/video from the client
        self.mediaEngine.createRtpEndpoint(
          { 
            apiContext: "conference_" + member.conferenceId,
            audio: audio,
            video: video,
            sdp: self.config.sdp.transmitAudioVideo
          }, function(response) {
            if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
              stream.rxRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
              member.streams[stream.uuid] = stream;
              socket.emit('publishSdpRequest', response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, stream);
            }
          }
        );
      }
    }
  })

  // the client's SDP answer for publishing a stream
  socket.on('publishSdpResponse', function(sdp, endpointId, streamUuid) {
    if (member.conferenceId) {
      if (sdp) {
        const stream = member.streams[streamUuid];
        self.mediaEngine.updateRtpEndpoint(
          endpointId,
          {
            apiContext: "conference_" + member.conferenceId,
            remoteDescription: {
              type: "answer",
              sdp: sdp
            }
          }, function(response) {
            if (response && response.updateRtpEndpointResponse && response.updateRtpEndpointResponse.success) {
              self.onStreamStatus(stream, true, member);
            }
          }
        );
      }
    }
  })

  // a client wants to stop streaming media
  socket.on('unpublishStream', function(stream) {
    const conference = self.conferences[member.conferenceId];
    if (conference) {
      Object.keys(member.streams).forEach(function(streamUuid) {
        if (member.streams[streamUuid].name == stream.name) {
          self.mediaEngine.destroyRtpEndpoint(member.streams[streamUuid].rxRtpEndpointId);
          self.onStreamStatus(member.streams[streamUuid], false, member);
        }
      });
    }
  });
  
  socket.on('disconnect', function() {
    if (member.conferenceId) {
      const conference = self.conferences[member.conferenceId];
      forEachMemberStream(member, function(stream) {
        if (stream.rxRtpEndpointId) {
          self.mediaEngine.destroyRtpEndpoint(stream.rxRtpEndpointId);
        }
        self.onStreamStatus(stream, false, member);
      });
      self.onMemberLeave(conference, member);
    }
  })

  // a client wants to subscribe to a stream
  socket.on('subscribeStream', function(stream, audio, video) {
    const conference = self.conferences[member.conferenceId];
    if (conference) {
      // create a RTP endpoint to transmit audio/video to the client
      self.mediaEngine.createRtpEndpoint( {
          apiContext: "conference_" + member.conferenceId,
          sdp: video?self.config.sdp.receiveAudioVideo:self.config.sdp.receiveAudio
      }, function(response) {
        if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
          var txRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
          socket.emit('subscribeSdpRequest', response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, txRtpEndpointId, stream);
        }
      });
    }
  })

  // the client's SDP answer for receiving a stream
  socket.on('subscribeSdpResponse', function(sdp, endpointId, stream) {
    if (member.conferenceId) {
      if (sdp) {
        self.mediaEngine.updateRtpEndpoint(
          endpointId,
          { 
            apiContext: "conference_" + member.conferenceId,
            remoteDescription: {
              type: "answer",
              sdp: sdp
            },
            sourceId: stream.rxRtpEndpointId
          },
          function(response) {
            if (response && response.updateRtpEndpointResponse && response.updateRtpEndpointResponse.success) {
            }
          }
        );
      }
    }
  })

}

function forEachMemberStream(member, callback) {
  var streamUuids = Object.keys(member.streams);
  streamUuids.forEach(function(streamUuid) {
    var stream = member.streams[streamUuid];
    callback(stream);
  });
}

ConferenceService.prototype.stop = function() {
  const self = this;
}

module.exports = ConferenceService;
