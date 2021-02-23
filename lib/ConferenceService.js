const jwt = require('jsonwebtoken');
const zmq = require('zeromq');
const Uuid = require('node-uuid');
const express = require('express');
const mustacheExpress = require('mustache-express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');

function ConferenceService(config, mediaEngine, messageBus, echoTestService) {
  const self = this;
  self.config = config;
  self.mediaEngine = mediaEngine;
  self.echoTestService = echoTestService;
  self.messageBus = messageBus;
  self.conferences = config.conferences;
  const conferenceIds = Object.keys(self.conferences);
  conferenceIds.forEach(function(conferenceId) {
    const conference = self.conferences[conferenceId];
    conference.id = conferenceId;
    conference.members = {};
    conference.locked = false;
    conference.recordings = 0;
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

ConferenceService.prototype.parseSimulcast = function(sdp) {
  const self = this;
  const lines = sdp.split('\r\n');
  let simulcast = [];
  lines.forEach(function(line) {
    if (line.toLowerCase().indexOf('a=simulcast:send ') !== -1) {
      line = line.substring('a=simulcast:send '.length);
      const streamIds = line.split(';');
      simulcast = streamIds;
    }
  });
  return simulcast;
}

ConferenceService.prototype.mediaEventCallback = function(json) {
  const self = this;

  if (json.rtpEndpointTimeOutEvent) {
    const endpointId = json.rtpEndpointTimeOutEvent.id;
    self.getStreamByRtpEndpointId(endpointId, function(stream, member, conference) {
      if (member && stream) {
        console.log('stream ' + stream.uuid + ' from member ' + member.uuid + ' timed out.');
        self.onStreamStatus(stream, false, member, 'rtp_timeout');
      }
    });
  } else if (json.rtpEndpointAudioEvent) {
    const endpointId = json.rtpEndpointAudioEvent.id;
    const event = json.rtpEndpointAudioEvent.event;
    self.getStreamByRtpEndpointId(endpointId, function(stream, member, conference) {
      if (stream && member && conference) {
        if (event === 'voiceActivityStart') {
        } else if (event === 'voiceActivityStop') {
        } else if (event === 'audioMuted') {
          console.log('member ' + member.name + ' ' + stream.name + ' muted the audio.');
        } else if (event === 'audioUnmuted') {
          console.log('member ' + member.name + ' ' + stream.name + ' unmuted the audio.');
        }
        self.messageBus.publishConferenceEvent(conference.id, 'streamMediaEvent', { member: { uuid: member.uuid }, event: event, stream: { uuid: stream.uuid } });
      }
    });
  } else if (json.rtpEndpointStatisticsEvent) {
    const endpointId = json.rtpEndpointStatisticsEvent.id;
    const stats = json.rtpEndpointStatisticsEvent;
    self.getStreamByRtpEndpointId(endpointId, function(stream, member, conference) {
      if (member && stream) {
//        console.log('STREAM: ' + member.name + ' ' + stream.name +' ', stats);
        if (stats.rtpRxVideoPlis) {
        } else {
        }
      } else {
      }
    });
    self.getSubscriptionByRtpEndpointId(endpointId, function(subscription, member, conference) {
      if (subscription) {
//        console.log('SUBSCRIPTION: ' + subscription.member.name + ' ' + subscription.stream.name +' ', stats);
      }
    });
  } else {
    console.log('mediaEventCallback: ', json);
  }
}

ConferenceService.prototype.start = function() {
  const self = this;
  self.app = express();
  self.app.use(bodyParser.urlencoded({ extended: false }));
  self.app.use(bodyParser.json({ limit: '1mb'}));
  self.app.use(cookieParser());
  self.app.engine('html', mustacheExpress());
  self.app.set('view engine', 'html');
  self.app.set('views', __dirname + '/tpl');

  self.http = require('http').createServer(self.app);

  self.app.use(function(req, res, next) {
    if (req.headers.origin) {
      res.header("Access-Control-Allow-Origin", req.headers.origin);
    } else {
       res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Credentials", true);
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Session");
    next();
  });

  self.app.options('*', function(req, res) {
    res.send("ok");
  });

  self.app.get('/link',function(req, res){
    if (req.query && req.query.token) {
      jwt.verify(req.query.token, self.config.jwt.secret, { maxAge: self.config.jwt.expiry }, function(error, decoded) {
        if (error) {
          return res.render('error.html', { error: error });
        } else {
          res.cookie('conference',JSON.stringify({ conference: decoded.conference, name: decoded.name, token: req.query.token }), { maxAge: 900000 });
          const conferenceId = decoded.conference;
          const conference = self.conferences[conferenceId];

          if (conference.locked) {
            return res.render('error.html', { error: 'The room "'+ conferenceId +'" has been locked by a moderator. You cannot join at the moment. Please try again later.'});
          }

          return  res.sendFile('link.html', { root: __dirname + '/tpl' });
        }
      });
    } else {
      return res.render('error.html', { error: 'Invalid token format'});
    }
  });

  self.app.get('/conference',function(req, res){
    let cookie = null;
    if (req.cookies.conference) {
      try {
        cookie = JSON.parse(req.cookies.conference);
      } catch (exception) {
      }
    }
    if (cookie && cookie.token) {
      jwt.verify(cookie.token, self.config.jwt.secret, { maxAge: self.config.jwt.expiry }, function(error, decoded) {
        if (error) {
          return res.render('error.html', { error: error });
        } else {
          res.cookie('conference',JSON.stringify({ conference: decoded.conference, name: req.query.name?req.query.name:"Guest", token: cookie.token }), { maxAge: 900000 });
          const conferenceId = decoded.conference;
          const conference = self.conferences[conferenceId];

          if (conference.locked) {
            return res.render('error.html', { error: 'The room "'+ conferenceId +'" has been locked by a moderator. You cannot join at the moment. Please try again later.'});
          }

          if (conference.mode === 'classroom') {
            return  res.sendFile('classroom.html', { root: __dirname + '/tpl' });
          } else {
            return  res.sendFile('conference.html', { root: __dirname + '/tpl' });
          }
        }
      });
    } else {
      return res.render('error.html', { error: "Unknown error." });
    }
  });

  self.app.post('/conference.json',function(req, res){
    console.log('BODY', req.body);
    if (!req.body || !req.body.conferenceId || !req.body.conferenceId.length) {
      return res.send({ success: false, reason: "missing_mandatory_parameter"});
    }
    const conferenceId = req.body.conferenceId.toLowerCase();
    const name = (req.body && req.body.name)?req.body.name:"Guest";
    const password = (req.body && req.body.password)?req.body.password:"";

    console.log('authenticate: ' + name + ' ' + conferenceId + ' ' + password);
    // authenticate
    if (self.conferences[conferenceId]) {
      const conference = self.conferences[conferenceId];
      if (conference.locked && (conference.moderatorPassword !== password)) {
        return res.send({ success: false, reason: "locked"});
      }

      const result = { success: true, mode: conference.mode, url: self.config.socketIo.url };
      if (conference.moderatorPassword === password) {
        result.moderator = true;
      } else if (conference.password === password) {
        result.moderator = false;
      } else if (conference.password === '') {
        result.moderator = false;
      } else {
        result.success = false;
        result.reason = 'unauthorized';
      }
      return res.send(result);
    }
    return res.send({ success: false, reason: "not_found"});
  })

  self.app.post('/conference',function(req, res){
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
      if (conference.locked && (conference.moderatorPassword !== password)) {
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

  const socketIo = require('socket.io')(self.http)
  self.io = socketIo.of('/');
  self.io.on('connection', function(socket) { self.onConnection(socket); });

  self.echoIo = socketIo.of('/echo.io');
  self.echoIo.on('connection', function(socket) {
    console.log('echoIo.onConnection');
    self.echoTestService.onConnection(socket);
  });

  self.http.listen(self.config.socketIo.port, function(){
    console.log('listening on *:' + self.config.socketIo.port);
  })


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

ConferenceService.prototype.forEachMemberSubscription = function(conference, webrtc, callback) {
  const self = this;
  const memberUuids = Object.keys(conference.members);
  memberUuids.forEach(function(memberUuid) {
    const member = conference.members[memberUuid];
    if (member.webrtc == webrtc) {
      forEachMemberSubscription(member, callback);
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

ConferenceService.prototype.getSubscriptionByRtpEndpointId = function(rtpEndpointId, callback) {
  const self = this;
  self.forEachConference(function(conference) {
    self.forEachMemberSubscription(conference, true, function(subscription, member) {
      if (subscription && subscription.txRtpEndpointId && (subscription.txRtpEndpointId === rtpEndpointId )) {
        callback(subscription, member, conference);
      }
    });
  });
}

ConferenceService.prototype.getSubscriptionByUuid = function(uuid, callback) {
  const self = this;
  self.forEachConference(function(conference) {
    self.forEachMemberSubscription(conference, true, function(subscription, member) {
      if (subscription && subscription.uuid && (subscription.uuid === uuid )) {
        callback(subscription, member, conference);
      }
    });
  });
}


ConferenceService.prototype.getStreamByConferenceIdAndUuid = function(conferenceId, uuid, callback) {
  const self = this;
  const conference = self.conferences[conferenceId];
  if (conference) {
    self.forEachMemberStream(conference, true, function(stream, member) {
      if (stream && stream.uuid && (stream.uuid === uuid )) {
        callback(stream, member);
      }
    });
  }
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
  member = conference.members[member.uuid];
  console.log('member ' + member.name + '(' + member.uuid + ') left conference ' + conference.id + ', now ' + Object.keys(conference.members).length + ' members');
  self.messageBus.publishConferenceEvent(member.conferenceId, 'memberLeft', { member: member });

  const streamUuids = Object.keys(member.streams);
  streamUuids.forEach(function(streamUuid) {
    const stream = member.streams[streamUuid];
    if (stream && stream.rxRtpEndpointId) {
      console.log('XXXX destroying ' + stream.rxRtpEndpointId);
      self.mediaEngine.destroyRtpEndpoint(stream.rxRtpEndpointId, function() {});
    }
  });
  member.streams = {};

  const subscriptionUuids = Object.keys(member.subscriptions);
  subscriptionUuids.forEach(function(subscriptionUuid) {
    const subscription = member.subscriptions[subscriptionUuid];
    if (subscription && subscription.txRtpEndpointId) {
      self.mediaEngine.destroyRtpEndpoint(subscription.txRtpEndpointId, function() {});
    }
  });
  member.subscriptions = {};


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
  if (conference.members[member.uuid]) {
    delete conference.members[member.uuid];
  }
}

ConferenceService.prototype.onStreamStatus = function(stream, active, member, reason) {
  const self = this;

  const conference = self.conferences[member.conferenceId];
  if (conference) {
    console.log('ConferenceService.onStreamStatus: ' + JSON.stringify(stream) + " active " + active + " member " + member.name);
    stream.active = active;
    self.messageBus.publishConferenceEvent(conference.id, 'streamStatus', { stream: stream, active: active, member: member, reason: reason });
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
  if (msg.token) {
    console.log('handleJoinConferenceRequest: token = ' + msg.token);
  }
  if (msg.sipConferenceId) {
    msg.conferenceId = msg.conferenceId.toLowerCase();
  }
  if (msg.token) {
    jwt.verify(msg.token, self.config.jwt.secret, { maxAge: self.config.jwt.expiry }, function(error, decoded) {
      if (error) {
        return client.send('joinConferenceResponse', { success: false, reason: 'unauthorized' });
      } else {
        msg.conferenceId = decoded.conference;
      }
   });
  }
  if (self.conferences[msg.conferenceId]) {
    const conference = self.conferences[msg.conferenceId];
    if (conference.moderatorPassword == msg.password) {
      client.member.moderator = true;
    }
    if (conference.password && !client.member.moderator && (conference.password != msg.password) && !msg.token) {
      return client.send('joinConferenceResponse', { success: false, reason: 'unauthorized' });
    }
    if (conference.locked && !client.member.moderator) {
      return client.send('joinConferenceResponse', { success: false, reason: 'locked' });
    }
    client.member.name = msg.name;
    self.onMemberJoin(conference, client.member);
    client.send('joinConferenceResponse', { success: true, memberList: conference.members, member: client.member, mode: conference.mode, options: conference.options, locked: conference.locked, recordings: conference.recordings, conferenceId: conference.id });

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
  } else {
    return client.send('joinConferenceResponse', { success: false, reason: 'unauthorized' });
  }
}

ConferenceService.prototype.handlePublishStream = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    const stream = { active: false, name: msg.name, audio: msg.audio, video: msg.video, uuid: Uuid.v4(), simulcast: [] };
    if (conference.mode === 'classroom') {
      if (msg.video && !client.member.moderator) {
        msg.video = false;
      }
    }
    if (msg.audio || msg.video) {
      var sdp = '';
      if (msg.audio && msg.video) {
        sdp = self.config.sdp.transmitAudioVideo;
        if (conference.options.simulcast) {
          sdp += self.config.sdp.videoSimulcast;
        }
      } else if (msg.video) {
        sdp = self.config.sdp.transmitVideo;
        if (conference.options.simulcast) {
          sdp += self.config.sdp.videoSimulcast;
        }
      } else {
        sdp = self.config.sdp.transmitAudio;
      }
      // create a RTP endpoint to receive audio/video from the client
      self.mediaEngine.createRtpEndpoint(
        {
          apiContext: "conference_" + client.member.conferenceId,
          audio: msg.audio,
          video: msg.video,
          rtcpCheating: ((conference.mode === 'classroom') && client.member.moderator),
          sdp: self.filterSdp(sdp, conference.options.stereo, conference.options.audioBitrate, conference.options.videoBitrate),
          voiceActivityDetectionMode: (conference.sip?3:-1)
        }, function(response) {
          if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
            const answerSdp = response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp;
            stream.rxRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
            client.member.streams[stream.uuid] = stream;
            client.send('publishSdpRequest', { sdp: answerSdp, stream: { name: stream.name, simulcast: stream.simulcast, uuid: stream.uuid }, turn: self.config.turn });
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
      stream.simulcast = self.parseSimulcast(msg.sdp);

      self.mediaEngine.updateRtpEndpoint(
        stream.rxRtpEndpointId,
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
    if (client.member.moderator && msg.stream && msg.stream.uuid) {
      self.getStreamByConferenceIdAndUuid(
        client.member.conferenceId, msg.stream.uuid,
        function(stream, member) {
          self.mediaEngine.destroyRtpEndpoint(stream.rxRtpEndpointId);
          self.onStreamStatus(stream, false, member);
          delete member.streams[msg.stream.uuid];
        }
      );
    } else {
      Object.keys(client.member.streams).forEach(function(streamUuid) {
        if (client.member.streams[streamUuid].name == msg.stream.name) {
          self.mediaEngine.destroyRtpEndpoint(client.member.streams[streamUuid].rxRtpEndpointId);
          self.onStreamStatus(client.member.streams[streamUuid], false, client.member);
          delete client.member.streams[streamUuid];
        }
      });
    }
  }
}

ConferenceService.prototype.handleSubscribeStream = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    self.getStreamByConferenceIdAndUuid(client.member.conferenceId, msg.stream.uuid, function(stream, member) {
      if (stream && member) {
        console.log('attaching ' + client.member.name + ' to stream ' + stream.name + ' from ' + member.name);
        // create a RTP endpoint to transmit audio/video to the client
        var sdp = '';
        if (msg.audio && msg.video) {
          sdp = self.config.sdp.receiveAudioVideo;
        } else if (msg.video) {
          sdp = self.config.sdp.receiveVideo;
        } else {
          sdp = self.config.sdp.receiveAudio;
        }

        self.mediaEngine.createRtpEndpoint( {
          apiContext: "conference_" + client.member.conferenceId,
          rtcpCheating: ((conference.mode === 'classroom') && member.moderator)?true:false,
          sdp: sdp
        }, function(response) {
          if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
            var txRtpEndpointId = response.createRtpEndpointResponse.rtpEndpoint.id;
            var subscription = { uuid: Uuid.v4(), stream: { uuid: stream.uuid, name: stream.name, rxRtpEndpointId: stream.rxRtpEndpointId }, member: { uuid: member.uuid, name: member.name }, txRtpEndpointId: txRtpEndpointId };
            client.member.subscriptions[subscription.uuid] = subscription;
            if (stream.simulcast && (stream.simulcast.length > 1)) {
              const simulcastStream = stream.simulcast[0].toString();
              self.mediaEngine.setRtpEndpointMediaFilter(
                subscription.txRtpEndpointId,
                {
                  transmitSubscribedAudio: true,
                  transmitSubscribedVideo: true,
                  publishReceivedAudio: true,
                  publishReceivedVideo: true,
                  transmitVideoStreamId: simulcastStream
                },
                function (result) {
                  if (!result.success) {
                    console.log('error in setRtpEndpointMediaFilter for endpoint id ' + subscription.txRtpEndpointId);
                  }
                }
              );
            }
            client.send('subscribeSdpRequest', { sdp: response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp, subscription: { uuid: subscription.uuid, stream: { uuid: stream.uuid } }, endpointId: txRtpEndpointId, stream: msg.stream, turn: self.config.turn });
          }
        });
      }
    });
  }
}

ConferenceService.prototype.handleSubscribeSdpResponse = function(msg, client) {
  const self = this;
  if (client.member.conferenceId && msg.subscription) {
    self.getSubscriptionByUuid(msg.subscription.uuid, function(subscription) {
      if (subscription && msg.sdp) {

        self.mediaEngine.updateRtpEndpoint(
          subscription.txRtpEndpointId,
          {
            apiContext: "conference_" + client.member.conferenceId,
            remoteDescription: {
              type: "answer",
              sdp: msg.sdp
            },
            sourceId: subscription.stream.rxRtpEndpointId
          },
          function(response) {
            if (response && response.updateRtpEndpointResponse && response.updateRtpEndpointResponse.success) {
            }
          }
        );

      }
    });
  }
}

ConferenceService.prototype.handleLockConference = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    conference.locked = true;
    console.log('ConferenceService.handleLockConference: conference ' + client.member.conferenceId + ' has been locked by ' + client.member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'conferenceStatus', { locked: conference.locked, recordings: conference.recordings });
  }
}

ConferenceService.prototype.handleUnlockConference = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    conference.locked = false;
    console.log('ConferenceService.handleLockConference: conference ' + client.member.conferenceId + ' has been unlocked by ' + client.member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'conferenceStatus', { locked: conference.locked, recordings: conference.recordings });
  }
}

ConferenceService.prototype.handleMemberMute = function(msg, client, mute) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && conference.members[msg.member.uuid]) {
    const member = conference.members[msg.member.uuid];
    Object.keys(member.streams).forEach(function(streamUuid) {
      const stream = member.streams[streamUuid];
      if (stream.audio) {
        if (stream.rxRtpEndpointId) {

          self.mediaEngine.setRtpEndpointMediaFilter(
            stream.rxRtpEndpointId,
            {
              apiContext: "conference_" + client.member.conferenceId,
              transmitSubscribedAudio: true,
              transmitSubscribedVideo: true,
              publishReceivedAudio: !mute,
              publishReceivedVideo: true
            },
            function(response) {
              if (response && response.setRtpEndpointMediaFilterResponse && response.setRtpEndpointMediaFilterResponse.success) {
                console.log('handleMemberMute: member ' + member.name + ' stream ' + stream.name + ' success ' + response.setRtpEndpointMediaFilterResponse.success + ' mute ' + mute);
                if (mute) {
                  self.messageBus.publishConferenceEvent(conference.id, 'streamMediaEvent', { member: { uuid: member.uuid }, event: "audioMuted", stream: { uuid: stream.uuid } });
                } else {
                  self.messageBus.publishConferenceEvent(conference.id, 'streamMediaEvent', { member: { uuid: member.uuid }, event: "audioUnmuted", stream: { uuid: stream.uuid } });
                }
              }
            }
          );
        }
      }
    });
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

ConferenceService.prototype.handleConferenceRecordingStatus = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    if (msg.recording) {
      conference.recordings++;
    } else {
      conference.recordings--;
    }
    if (conference.recordings < 0) {
      conference.recordings = 0;
    }
    console.log('ConferenceService.handleConferenceRecordingStatus: conference ' + client.member.conferenceId + ' has changed recording status to ' + conference.recordings + ' by ' + client.member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'conferenceStatus', { locked: conference.locked, recordings: conference.recordings });
  }
}

ConferenceService.prototype.handleStreamRecordingStatus = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    if (msg.recording) {
      conference.recordings++;
    } else {
      conference.recordings--;
    }
    if (conference.recordings < 0) {
      conference.recordings = 0;
    }
    console.log('ConferenceService.handleConferenceRecordingStatus: conference ' + client.member.conferenceId + ' has changed recording status to ' + conference.recordings + ' by ' + client.member.name);
    self.messageBus.publishConferenceEvent(conference.id, 'conferenceStatus', { locked: conference.locked, recordings: conference.recordings });
  }
}

ConferenceService.prototype.handleChatMessage = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    self.messageBus.publishConferenceEvent(conference.id, 'chatMessage', { message: msg.message, member: client.member });
  }
}

ConferenceService.prototype.handleUpdateMemberData = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference) {
    if ((msg.member !== undefined) && (msg.member.name !== undefined)) {
      client.member.name = msg.member.name
    }
    self.messageBus.publishConferenceEvent(conference.id, 'updateMemberData', { member: client.member });
  }
}

ConferenceService.prototype.handleAuthTokenRequest = function(msg, client) {
  const self = this;
  const conference = self.conferences[client.member.conferenceId];
  if (conference && client.member.moderator) {
    const payload = { conference: client.member.conferenceId };
    if (msg.options) {
      if ((msg.options.multi !== undefined) && (msg.options.multi === false)) {
        payload.uuid = Uuid.v4();
      }
    }
    const token = jwt.sign(payload, self.config.jwt.secret);
    client.send('authTokenResponse', { success: true, token: token });
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
    } else if (msg.conferenceRecordingStatus) {
      self.handleConferenceRecordingStatus(msg.conferenceRecordingStatus, client);
    } else if (msg.streamRecordingStatus) {
      self.handleStreamRecordingStatus(msg.streamRecordingStatus, client);
    } else if (msg.updateMemberData) {
      self.handleUpdateMemberData(msg.updateMemberData, client);
    } else if (msg.authTokenRequest) {
      self.handleAuthTokenRequest(msg.authTokenRequest, client);
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
  const client = { member: { webrtc: true, uuid: Uuid.v4(), moderator: false, streams: {}, subscriptions: {} } };
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
        client.socket.emit(message, data.success, data.memberList, data.member, data.mode, data.options, data.locked, data.recordings, data.conferenceId, data.reason);
      } else if (message === 'publishSdpRequest') {
        client.socket.emit(message, data.sdp, data.stream, data.turn);
      } else if (message === 'subscribeSdpRequest') {
        client.socket.emit(message, data.sdp, data.subscription, data.turn);
      } else if (message === 'streamStatus') {
        client.socket.emit(message, data.stream, data.active, data.member, data.reason);
      } else if (message === 'memberJoined') {
        client.socket.emit(message, data.member);
      } else if (message === 'memberLeft') {
        client.socket.emit(message, data.member);
      } else if (message === 'chatMessage') {
        client.socket.emit(message, data);
      } else if (message === 'conferenceStatus') {
        client.socket.emit(message, data.locked, data.recordings);
      } else if (message === 'conferenceRecordingStatus') {
        client.socket.emit(message, data.recordings);
      } else if (message === 'streamRecordingStatus') {
        client.socket.emit(message, data.uuid, data.recording);
      } else if (message === 'updateMemberData') {
        client.socket.emit(message, data.member);
      } else if (message === 'streamMediaEvent') {
        client.socket.emit(message, data.stream, data.event, data.member);
      } else if (message === 'authTokenResponse') {
        client.socket.emit(message, data.success, data.token);
      } else {
        console.log('ConferenceService.client.socket.send: ' + message, data);
      }
    } catch (error) {
      console.log(error);
    }
  }

  socket.on('joinConferenceRequest', function(conferenceId, password, name, token) {
    self.handleMessage({ joinConferenceRequest: { conferenceId: conferenceId, password: password, name: name, token: token } }, client);
  });

  // a client wants to start streaming its local media
  socket.on('publishStream', function(name, audio, video) {
    self.handleMessage({ publishStream: { name: name, audio: audio, video: video } }, client);
  });

  // the client's SDP answer for publishing a stream
  socket.on('publishSdpResponse', function(sdp, streamUuid) {
// remove endpoint it
    self.handleMessage({ publishSdpResponse: { sdp: sdp, streamUuid: streamUuid } }, client);
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
  socket.on('subscribeSdpResponse', function(sdp, subscription) {
    self.handleMessage({ subscribeSdpResponse: { sdp: sdp, subscription: subscription } }, client);
  });

  socket.on('lockConference', function() {
    self.handleMessage({ lockConference: { } }, client);
  });

  socket.on('unlockConference', function() {
    self.handleMessage({ unlockConference: { } }, client);
  });

  socket.on('conferenceRecordingStatus', function(recording) {
    self.handleMessage({ conferenceRecordingStatus: { recording: recording } }, client);
  });

  socket.on('streamRecordingStatus', function(uuid, recording) {
    self.handleMessage({ streamRecordingStatus: { uuid: uuid, recording: recording } }, client);
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

  socket.on('updateMemberData', function(member) {
    self.handleMessage({ updateMemberData: { member: member } }, client);
  });

  socket.on('authTokenRequest', function(options) {
    self.handleMessage({ authTokenRequest: { options: options} }, client);
  });
}

function forEachMemberStream(member, callback) {
  var streamUuids = Object.keys(member.streams);
  streamUuids.forEach(function(streamUuid) {
    var stream = member.streams[streamUuid];
    callback(stream, member);
  });
}

function forEachMemberSubscription(member, callback) {
  var subscriptionUuids = Object.keys(member.subscriptions);
  subscriptionUuids.forEach(function(subscriptionUuid) {
    var subscription = member.subscriptions[subscriptionUuid];
    callback(subscription, member);
  });
}

ConferenceService.prototype.stop = function() {
  const self = this;
}

module.exports = ConferenceService;
