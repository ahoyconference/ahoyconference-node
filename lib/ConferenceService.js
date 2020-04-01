const zmq = require('zeromq');
const Uuid = require('node-uuid');
const express = require('express');
const mustacheExpress = require('mustache-express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');

function ConferenceService(config, mediaEngine, messageBus) {
  const self = this;
  self.config = config;
  self.mediaEngine = mediaEngine;
  self.messageBus = messageBus;
  self.conferences = config.conferences;
  const conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    conference.id = conferenceId;
    conference.members = {};
    conference.locked = false;
  });
  mediaEngine.setMediaEventCallback(function(mediaEvent) {
    self.mediaEventCallback(mediaEvent);
  });
}

ConferenceService.prototype.filterSdp = function(sdp, stereo, maxAudioBitrate, maxVideoBitrate) {
  const self = this;
  const lines = sdp.split('\r\n');
  const output = [];
  lines.forEach(function(line) {
    if (line.toLowerCase().indexOf('m=video') !== -1) {
      output.push(line);
      if (maxVideoBitrate) {
        output.push('b=AS:' + maxVideoBitrate)
        output.push('b=TIAS:' + (maxVideoBitrate * 1000))
      }
    } else if (line.toLowerCase().indexOf('b=AS:') !== -1) {
    } else if (line.toLowerCase().indexOf('b=TIAS:') !== -1) {
    } else if (line.indexOf('a=fmtp:111') !== -1) {
      if (stereo) {
        line += ' stereo=1; sprop-stereo=1;';
      }
      if (maxAudioBitrate > 0) {
        line += ' maxaveragebitrate=' + (maxAudioBitrate * 1000) + ';';
      }
      output.push(line);
    } else {
      output.push(line);
    }
  });
  return output.join('\r\n');
}

ConferenceService.prototype.mediaEventCallback = function(json) {
  const self = this;

  if (json.rtpEndpointTimeOutEvent) {
    const endpointId = json.rtpEndpointTimeOutEvent.id;
    self.getStreamByRtpEndpointId(endpointId, function(stream, member, conference) {
      if (member && stream) {
        console.log('stream ' + stream.uuid + ' from member ' + member.uuid + ' timed out.');
        self.onStreamStatus(stream, false, member);
      }
    });
  } else if (json.rtpEndpointVadEvent) {
    const endpointId = json.rtpEndpointVadEvent.id;
    const event = json.rtpEndpointVadEvent.event;
    self.getStreamByRtpEndpointId(endpointId, function(stream, member, conference) {
      if (stream && member && conference) {
        if (event === 'voiceActivityStart') {
        } else if (event === 'voiceActivityStop') {
        }
      }
    });
  } else {
  }
}

ConferenceService.prototype.start = function() {
  const self = this;
  self.app = express();
  self.app.use(bodyParser.urlencoded({ extended: false }));
  self.app.use(cookieParser());
  self.app.engine('html', mustacheExpress());
  self.app.set('view engine', 'html');
  self.app.set('views', __dirname + '/tpl');

  self.http = require('http').createServer(self.app);

  self.app.post('/conference',function(req, res){
    console.log('post', req.body.conferenceId);

    if (!req.body || !req.body.conferenceId || !req.body.conferenceId.length) {
      return res.redirect('/');
    }
    const conferenceId = req.body.conferenceId.toLowerCase();
    const name = (req.body && req.body.name)?req.body.name:"Guest";
    const password = (req.body && req.body.password)?req.body.password:"";

    console.log('authenticate: ' + name + ' ' + conferenceId + ' ' + password);
    console.log('cookies', req.cookies);
    // authenticate
    if (self.conferences[conferenceId]) {
      res.cookie('conference',JSON.stringify({ conference: conferenceId, name: name, password: password }), { maxAge: 900000 });
      const conference = self.conferences[conferenceId];
      if (conference.locked) {
        return res.render('error.html', { error: 'The room "'+ conferenceId +'" has been locked by a moderator. You cannot join at the moment. Please try again later.'});
      }

      if (conference.mode === 'classroom') {
        if (conference.moderatorPassword === password) {
          return res.sendFile('teacher.html', { root: __dirname + '/tpl' });
        } else if (conference.password === password) {
          return  res.sendFile('classroom.html', { root: __dirname + '/tpl' });
        } else if (conference.password === '') {
          return  res.sendFile('classroom.html', { root: __dirname + '/tpl' });
        } else {
          return res.render('error.html', { error: 'The password is not correct'});
        }
      } else {
        if (conference.moderatorPassword === password) {
          return res.sendFile('moderator.html', { root: __dirname + '/tpl' });
        } else if (conference.password === password) {
          return  res.sendFile('conference.html', { root: __dirname + '/tpl' });
        } else if (conference.password === '') {
          return  res.sendFile('conference.html', { root: __dirname + '/tpl' });
        } else {
          return res.render('error.html', { error: 'The password is not correct'});
        }
      }

    }
    return res.render('error.html', { error: 'The room "'+ conferenceId +'" does not exist.'});
  });

  self.app.use('/', express.static('www'));
  self.http.listen(self.config.socketIo.port, function(){
    console.log('listening on *:' + self.config.socketIo.port);
  })

  self.io = require('socket.io')(self.http);
  self.io.on('connection', function(socket) { self.onConnection(socket); });

/*  self.wss = new WebSocket.Server({ server: self.http, path: '/socket.ws' });
  self.wss.on('connection', function(ws) { self.onWebSocket(ws); }); */
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

ConferenceService.prototype.forEachMemberStream = function(conference, webrtc, callback) {
  const self = this;
  const memberUuids = Object.keys(conference.members);
  memberUuids.forEach(function(memberUuid) {
    const member = conference.members[memberUuid];
    if (member.webrtc == webrtc) {
      forEachMemberStream(member, callback);
    }
  });
}

ConferenceService.prototype.getStreamByRtpEndpointId = function(rtpEndpointId, callback) {
  const self = this;
  self.forEachConference(function(conference) {
    self.forEachMemberStream(conference, true, function(stream, member) {
      if (stream && stream.rxRtpEndpointId && (stream.rxRtpEndpointId === rtpEndpointId )) {
        callback(stream, member, conference);
      }
    });
  });
}

ConferenceService.prototype.onMemberJoin = function(conference, member) {
  const self = this;
  conference.members[member.uuid] = member;
  member.conferenceId = conference.id;
  console.log('member ' + member.name + '(' + member.uuid + ') joined conference ' + conference.id + ', now ' + Object.keys(conference.members).length + ' members');
  self.messageBus.publishConferenceEvent(conference.id, 'memberJoined', { member: member });
}

ConferenceService.prototype.onMemberLeave = function(conference, member) {
  const self = this;
  if (conference.members[member.uuid]) {
    delete conference.members[member.uuid];
  }
  console.log('member ' + member.name + '(' + member.uuid + ') left conference ' + conference.id + ', now ' + Object.keys(conference.members).length + ' members');
  self.messageBus.publishConferenceEvent(member.conferenceId, 'memberLeft', { member: member });

  member.streams = {};
  const memberUuids = Object.keys(conference.members);
  let hasSipMembers = false;
  memberUuids.forEach(function(memberUuid) {
    if (conference.members[memberUuid].webrtc == false) {
      hasSipMembers = true;
    }
  });
  if (memberUuids.length === 0) {
    conference.locked = false;
  }
  if (!hasSipMembers && conference.sipConferenceId) {
    delete conference.sipConferenceId;
  }
}

ConferenceService.prototype.onStreamStatus = function(stream, active, member) {
  const self = this;

  const conference = self.conferences[member.conferenceId];
  if (conference) {
    console.log('ConferenceService.onStreamStatus: ' + JSON.stringify(stream) + " active " + active + " member " + member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'streamStatus', { stream: stream, active: active, member: member });
    if (member.webrtc) {
      self.forEachMemberStream(conference, false, function(sipStream) {
        if (sipStream.rtpMixerId) {
          if (active) {
            self.mediaEngine.addRtpMixerSource(sipStream.rtpMixerId, stream.rxRtpEndpointId);
          } else {
            // a mixer source will be removed automatically if the corresponding rtp endpoint has been shutdown.
          }
        }
      });
    }
  }
}

ConferenceService.prototype.handleJoinConferenceRequest = function(msg, client) {
  const self = this;
  if (msg.sipConferenceId) {
    msg.conferenceId = msg.conferenceId.toLowerCase();
  }
  if (self.conferences[msg.conferenceId]) {
    const conference = self.conferences[msg.conferenceId];
    if (conference.moderatorPassword == msg.password) {
      client.member.moderator = true;
    }
    if (conference.password && !client.member.moderator && (conference.password != msg.password)) {
      return client.send('joinConferenceResponse', { success: false, reason: 'unauthorized' });
    }
    if (conference.locked) {
      return client.send('joinConferenceResponse', { success: false, reason: 'locked' });
    }
    client.member.name = msg.name;
    self.onMemberJoin(conference, client.member);
    client.send('joinConferenceResponse', { success: true, memberList: conference.members, member: client.member, mode: conference.mode, options: conference.options });

    client.subSocket = zmq.socket('sub');
    client.subSocket.connect(self.config.messageBus.subscriptionUri);
    client.subSocket.on('message', function(to, from, timestamp, message) {
      to = to.toString();
      message = message.toString();
      try {
        const parts = to.split('|');
        if (parts && (parts.length >= 2)) {
          const event = parts[1];
          const json = JSON.parse(message);
          client.send(event, json);
        }
      } catch (error) {
        console.log('error', error);
      }
    });
    client.subSocket.subscribe('conference_' + msg.conferenceId);
  }
}

ConferenceService.prototype.handlePublishStream = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    const stream = { active: false, name: msg.name, audio: msg.audio, video: msg.video, uuid: Uuid.v4() };
    if (conference.mode === 'classroom') {
      if (msg.video && !client.member.moderator) {
        msg.video = false;
      }
    }
    if (msg.audio || msg.video) {
      // create a RTP endpoint to receive audio/video from the client
      self.mediaEngine.createRtpEndpoint(
        {
          apiContext: "conference_" + client.member.conferenceId,
          audio: msg.audio,
          video: msg.video,
          rtcpCheating: ((conference.mode === 'classroom') && client.member.moderator),
          sdp: self.filterSdp(msg.video?self.config.sdp.transmitAudioVideo:self.config.sdp.transmitAudio, conference.options.stereo, conference.options.audioBitrate, conference.options.videoBitrate),
          voiceActivityDetectionMode: (conference.sip?3:-1)
        }, function(response) {
          if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
            stream.rxRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
            client.member.streams[stream.uuid] = stream;
            client.send('publishSdpRequest', { sdp: response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, stream: stream, turn: self.config.turn });
          }
        }
      );
    }
  }
}

ConferenceService.prototype.handlePublishSdpResponse = function(msg, client) {
  const self = this;
  if (client.member.conferenceId) {
    if (msg.sdp) {
      const stream = client.member.streams[msg.streamUuid];
      self.mediaEngine.updateRtpEndpoint(
        msg.endpointId,
        {
          apiContext: "conference_" + client.member.conferenceId,
          remoteDescription: {
            type: "answer",
            sdp: msg.sdp
          }
        }, function(response) {
          if (response && response.updateRtpEndpointResponse && response.updateRtpEndpointResponse.success) {
            stream.active = true;
            self.onStreamStatus(stream, true, client.member);
          }
        }
      );
    }
  }
}

ConferenceService.prototype.handleUnpublishStream = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    Object.keys(client.member.streams).forEach(function(streamUuid) {
      if (client.member.streams[streamUuid].name == msg.stream.name) {
        self.mediaEngine.destroyRtpEndpoint(client.member.streams[streamUuid].rxRtpEndpointId);
        self.onStreamStatus(client.member.streams[streamUuid], false, client.member);
        delete client.member.streams[streamUuid];
      }
    });
  }
}

ConferenceService.prototype.handleSubscribeStream = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    // create a RTP endpoint to transmit audio/video to the client
    self.mediaEngine.createRtpEndpoint( {
      apiContext: "conference_" + client.member.conferenceId,
      sdp: msg.video?self.config.sdp.receiveAudioVideo:self.config.sdp.receiveAudio
    }, function(response) {
      if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
        var txRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
        client.send('subscribeSdpRequest', { sdp: response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, endpointId: txRtpEndpointId, stream: msg.stream, turn: self.config.turn });
      }
    });
  }
}

ConferenceService.prototype.handleSubscribeSdpResponse = function(msg, client) {
  const self = this;
  if (client.member.conferenceId) {
    if (msg.sdp) {
      self.mediaEngine.updateRtpEndpoint(
        msg.endpointId,
        {
          apiContext: "conference_" + client.member.conferenceId,
          remoteDescription: {
            type: "answer",
            sdp: msg.sdp
          },
          sourceId: msg.stream.rxRtpEndpointId
        },
        function(response) {
          if (response && response.updateRtpEndpointResponse && response.updateRtpEndpointResponse.success) {
          }
        }
      );
    }
  }
}

ConferenceService.prototype.handleLockConference = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    conference.locked = true;
    console.log('ConferenceService.handleLockConference: conference ' + client.member.conferenceId + ' has been locked by ' + client.member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'conferenceLockStatus', { locked: conference.locked });
  }
}

ConferenceService.prototype.handleUnlockConference = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    conference.locked = false;
    console.log('ConferenceService.handleLockConference: conference ' + client.member.conferenceId + ' has been unlocked by ' + client.member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'conferenceLockStatus', { locked: conference.locked });
  }
}

ConferenceService.prototype.handleMemberMute = function(msg, client, mute) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && conference.members[msg.member.uuid]) {
    const member = conference.members[msg.member.uuid];
    // moderators can mute but not unmute (privacy)
    // members can mute/unmute themselves
    if (mute) {
      if (client.member.moderator || (client.member.uuid == member.uuid)) {
        // destroy the rtp endpoints for all streams that have audio and recreate them with video only
        Object.keys(member.streams).forEach(function(streamUuid) {
          const stream = member.streams[streamUuid];
          if (stream.audio) {
            if (stream.rtpEndpointId) {
              self.mediaEngine.destroyRtpEndpoint(stream.rxRtpEndpointId);
              stream.active = false;
              stream.rxRtpEndpointId = null;
            }
            stream.audio = false;
            self.onStreamStatus(stream, false, member);
            console.log('ConferenceService.handleMemberMute: member ' + member.name + ' has been muted by ' + client.member.name);

            if (stream.video) {
              self.mediaEngine.createRtpEndpoint(
                {
                  apiContext: "conference_" + member.conferenceId,
                  video: true,
                  rtcpCheating: ((conference.mode === 'classroom') && member.moderator),
                  sdp: self.filterSdp(self.config.sdp.transmitVideo, conference.options.stereo, conference.options.audioBitrate, conference.options.videoBitrate)
                }, function(response) {
                  if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
                    stream.rxRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
                    member.send('publishSdpRequest', { sdp: response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, stream: stream, turn: self.config.turn });
                  }
                }
              );
            }
          }
        });
      }
    } else if (client.member.uuid === member.uuid) {
      Object.keys(member.streams).forEach(function(streamUuid) {
        const stream = member.streams[streamUuid];
        if (stream.rtpEndpointId) {
          self.mediaEngine.destroyRtpEndpoint(stream.rxRtpEndpointId);
          stream.active = false;
          stream.rxRtpEndpointId = null;
        }
        self.onStreamStatus(stream, false, member);
        console.log('ConferenceService.handleMemberMute: member ' + member.name + ' has been unmuted by ' + client.member.name);

        stream.audio = true;
        if (stream.video) {
          self.mediaEngine.createRtpEndpoint(
            {
              apiContext: "conference_" + client.member.conferenceId,
              audio: stream.audio,
              video: stream.video,
              rtcpCheating: ((conference.mode === 'classroom') && client.member.moderator),
              sdp: self.filterSdp(stream.video?self.config.sdp.transmitAudioVideo:self.config.sdp.transmitAudio, conference.options.stereo, conference.options.audioBitrate, conference.options.videoBitrate)
            }, function(response) {
              if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
                stream.rxRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
                client.send('publishSdpRequest', { sdp: response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, stream: stream, turn: self.config.turn });
              }
            }
          );
        }
      });
    }
  }
}

ConferenceService.prototype.handleKickMember = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    if (conference.members[msg.member.uuid]) {
      const member = conference.members[msg.member.uuid];
      member.disconnect();
      console.log('ConferenceService.handleKickMember: member ' + member.name + ' has been kicked by ' + client.member.name);
    }
  }
}

ConferenceService.prototype.handleChatMessage = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    self.messageBus.publishConferenceEvent(conference.id, 'chatMessage', { message: msg.message, member: client.member });
  }
}

ConferenceService.prototype.handleMessage = function(message, client) {
  const self = this;
  try {
    let msg = null;
    if (message instanceof Object) {
      msg = message;
    } else {
      msg = JSON.parse(message);
    }

    if (msg.joinConferenceRequest) {
      self.handleJoinConferenceRequest(msg.joinConferenceRequest, client);
    } else if (msg.publishStream) {
      self.handlePublishStream(msg.publishStream, client);
    } else if (msg.publishSdpResponse) {
      self.handlePublishSdpResponse(msg.publishSdpResponse, client);
    } else if (msg.subscribeSdpResponse) {
      self.handleSubscribeSdpResponse(msg.subscribeSdpResponse, client);
    } else if (msg.unpublishStream) {
      self.handleUnpublishStream(msg.unpublishStream, client);
    } else if (msg.subscribeStream) {
      self.handleSubscribeStream(msg.subscribeStream, client);
    } else if (msg.lockConference) {
      self.handleLockConference(msg.lockConference, client);
    } else if (msg.unlockConference) {
      self.handleUnlockConference(msg.unlockConference, client);
    } else if (msg.muteMember) {
      self.handleMemberMute(msg.muteMember, client, true);
    } else if (msg.unmuteMember) {
      self.handleMemberMute(msg.unmuteMember, client, false);
    } else if (msg.kickMember) {
      self.handleKickMember(msg.kickMember, client);
    } else if (msg.chatMessage) {
      self.handleChatMessage(msg.chatMessage, client);
    } else {
      console.log('handleMessage: ', msg);
    }
  } catch (error) {
    console.log(error);
  }
}

ConferenceService.prototype.onWebSocket = function(ws) {
  const self = this;
  const client = { member: { webrtc: true, uuid: Uuid.v4(), moderator: false, streams: {} } };

  client.ws = ws;

  ws.on('message', function(message) {
    console.log('received: %s', message);
    try {
      const json = JSON.parse(message);
      self.handleMessage(json, client);
    } catch (error) {
      console.log('error', error);
    }
  });
  client.send = function(message, data) {
    try {
      let msg = {};
      msg[message] = data;
      client.ws.send(JSON.stringify(msg));
    } catch (error) {
      console.log(error);
    }
  }
}

ConferenceService.prototype.onConnection = function(socket) {
  const self = this;
  const client = { member: { webrtc: true, uuid: Uuid.v4(), moderator: false, streams: {} } };
  client.socket = socket;
  console.log('ConferenceService.onConnection');
  client.member.disconnect = function() {
    console.log('disconnecting.');
    client.socket.emit('memberLeft', client.member);
    client.socket.disconnect(true);
  }
  client.member.send = function(message, data) {
    client.send(message,data);
  }
  client.send = function(message, data) {
    try {
      if (message === 'joinConferenceResponse') {
        client.socket.emit(message, data.success, data.memberList, data.member, data.mode, data.options);
      } else if (message === 'publishSdpRequest') {
        client.socket.emit(message, data.sdp, data.stream, data.turn);
      } else if (message === 'subscribeSdpRequest') {
        client.socket.emit(message, data.sdp, data.endpointId, data.stream, data.turn);
      } else if (message === 'streamStatus') {
        client.socket.emit(message, data.stream, data.active, data.member);
      } else if (message === 'memberJoined') {
        client.socket.emit(message, data.member);
      } else if (message === 'memberLeft') {
        client.socket.emit(message, data.member);
      } else if (message === 'chatMessage') {
        client.socket.emit(message, data);
      } else if (message === 'conferenceLockStatus') {
        client.socket.emit(message, data.locked);
      } else {
        console.log('ConferenceService.client.socket.send: ' + message, data);
      }
    } catch (error) {
      console.log(error);
    }
  }

  socket.on('joinConferenceRequest', function(conferenceId, password, name) {
    self.handleMessage({ joinConferenceRequest: { conferenceId: conferenceId, password: password, name: name } }, client);
  });

  // a client wants to start streaming its local media
  socket.on('publishStream', function(name, audio, video) {
    self.handleMessage({ publishStream: { name: name, audio: audio, video: video } }, client);
  });

  // the client's SDP answer for publishing a stream
  socket.on('publishSdpResponse', function(sdp, endpointId, streamUuid) {
    self.handleMessage({ publishSdpResponse: { sdp: sdp, endpointId: endpointId, streamUuid: streamUuid } }, client);
  });

  // a client wants to stop streaming media
  socket.on('unpublishStream', function(stream) {
    self.handleMessage({ unpublishStream: { stream: stream } }, client);
  });

  socket.on('disconnect', function() {
    console.log('client disconnected');
    if (client.subSocket) {
      try {
        client.subSocket.close();
        client.subSocket = null;
      } catch (error) {

      }
    }
    if (client.member.conferenceId) {
      const conference = self.conferences[client.member.conferenceId];
      forEachMemberStream(client.member, function(stream) {
        if (stream.rxRtpEndpointId) {
          self.mediaEngine.destroyRtpEndpoint(stream.rxRtpEndpointId);
        }
        self.onStreamStatus(stream, false, client.member);
      });
      self.onMemberLeave(conference, client.member);
    }
  })

  // a client wants to subscribe to a stream
  socket.on('subscribeStream', function(stream, audio, video) {
    self.handleMessage({ subscribeStream: { stream: stream, audio: audio, video: video } }, client);
  });

  // the client's SDP answer for receiving a stream
  socket.on('subscribeSdpResponse', function(sdp, endpointId, stream) {
    self.handleMessage({ subscribeSdpResponse: { sdp: sdp, endpointId: endpointId, stream: stream } }, client);
  });

  socket.on('lockConference', function() {
    self.handleMessage({ lockConference: { } }, client);
  });

  socket.on('unlockConference', function() {
    self.handleMessage({ unlockConference: { } }, client);
  });

  socket.on('kickMember', function(member) {
    self.handleMessage({ kickMember: { member: member } }, client);
  });

  socket.on('muteMember', function(member) {
    self.handleMessage({ muteMember: { member: member } }, client);
  });

  socket.on('unmuteMember', function(member) {
    self.handleMessage({ unmuteMember: { member: member } }, client);
  });

  socket.on('chatMessage', function(msg) {
    self.handleMessage({ chatMessage: { message: msg } }, client);
  });

}

function forEachMemberStream(member, callback) {
  var streamUuids = Object.keys(member.streams);
  streamUuids.forEach(function(streamUuid) {
    var stream = member.streams[streamUuid];
    callback(stream, member);
  });
}

ConferenceService.prototype.stop = function() {
  const self = this;
}

module.exports = ConferenceService;
