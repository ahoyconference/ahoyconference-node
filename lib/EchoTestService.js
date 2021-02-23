const zmq = require('zeromq');
const Uuid = require('node-uuid');
const express = require('express');
const mustacheExpress = require('mustache-express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const MediaEngine = require('./MediaEngine');


function EchoTestService(config) {
  const self = this;
  self.config = config;
  self.mediaEngine = new MediaEngine(config);

  self.mediaEngine.setMediaEventCallback(function(mediaEvent) {
    self.mediaEventCallback(mediaEvent);
  });
}

EchoTestService.prototype.start = function() {
  const self = this;
  self.echoTests = {};
  self.mediaEngine.start();
}

EchoTestService.prototype.stop = function() {
  const self = this;
}

EchoTestService.prototype.getEchoTestByRtpEndpointId = function(endpointId, callback) {
  const self = this;
  if (self.echoTests[endpointId]) callback(self.echoTests[endpointId]);
}

EchoTestService.prototype.mediaEventCallback = function(event) {
  const self = this;

  if (!event) return;
  if (event.rtpEndpointStatisticsEvent) {
    var endpointId = event.rtpEndpointStatisticsEvent.id;
    self.getEchoTestByRtpEndpointId(endpointId, function(echotest) {
      delete event.rtpEndpointStatisticsEvent['id'];
      event.rtpEndpointStatisticsEvent['date'] = new Date();
      echotest.statistics.push(event.rtpEndpointStatisticsEvent);
    });
  } else if (event.rtpEndpointVadEvent) {
    var endpointId = event.rtpEndpointVadEvent.id;
    self.getEchoTestByRtpEndpointId(endpointId, function(echotest) {
      if (event.rtpEndpointVadEvent.event === 'voiceActivityStart') {
        echotest.voiceActivityDetected = true;
      }
    });
  } else if (event.rtpEndpointAudioEvent) {
    var endpointId = event.rtpEndpointAudioEvent.id;
    self.getEchoTestByRtpEndpointId(endpointId, function(echotest) {
      if (event.rtpEndpointAudioEvent.event === 'voiceActivityStart') {
        echotest.voiceActivityDetected = true;
      }
    });
  } else if (event.rtpEndpointTimeOutEvent) {
    var endpointId = event.rtpEndpointTimeOutEvent.id;
    console.log('echotest timed out');
    self.getEchoTestByRtpEndpointId(endpointId, function(echotest) {
      if (echotest.timer) {
        clearTimeout(echotest.timer);
        echotest.timer = null;
      }
      self.mediaEngine.destroyRtpEndpoint(echotest.rtpEndpoint.id,
        function(error, statistics) {
          let result = null;
          if (statistics) {
            logger.info('echotest ' + echotest.uuid + ' has timed out (media layer).', statistics);
            result = self.processCallStatistics(echotest, 'timeout', statistics);
          }
          echotest.socket.emit('echoTestComplete', false, result, echotest.uuid);
          echotest.scoket = null;
        }
      );
      delete self.echoTests[endpointId];
      echotest.rtpEndpoint = null;
    });
  } else {
    console.log('event: ' + JSON.stringify(event));
  }
}

EchoTestService.prototype.processCallStatistics = function(echotest, status, cumulatedStatistics) {
  var self = this;
  echotest.status = status;
  echotest.endedAt = new Date();

  var maxVideoBitrate = 0.0;
  var videoPlisReceived = 0;
  var videoNacksReceived = 0;
  echotest.statistics.forEach(function(statistic) {
    if (statistic.rtpRxVideoBitrate > maxVideoBitrate) {
      maxVideoBitrate = statistic.rtpRxVideoBitrate;
    }
    videoPlisReceived += statistic.rtpRxVideoPlis;
    videoNacksReceived += statistic.rtpRxVideoNacks;
  });
  echotest.maxVideoBitrate = maxVideoBitrate;
  if (cumulatedStatistics.rtpRxOctets > 0) {
    echotest.mediaLayerFailed = false;
    echotest.status = status;
  } else {
     if (status === 'timeout') {
       echotest.status = 'timeout';
     } else {
       echotest.status = 'network_error';
     }
  }
  echotest.packetsLost = cumulatedStatistics.rtpRxPacketsLost;
  echotest.bytesReceived = cumulatedStatistics.rtpRxOctets;
  echotest.bytesTransmitted = cumulatedStatistics.rtpTxOctets;

  return {
    mediaLayerFailed: echotest.mediaLayerFailed,
    voiceActivityDetected: echotest.voiceActivityDetected,
    packetsLost: echotest.packetsLost,
    bytesReceived: echotest.bytesReceived,
    bytesTransmitted: echotest.bytesTransmitted,
    status: echotest.status,
    maxVideoBitrate: echotest.maxVideoBitrate,
    videoPlisReceived: videoPlisReceived,
    videoNacksReceived: videoNacksReceived,
    statistics: echotest.statistics
  };

}


EchoTestService.prototype.filterSdp = function(sdp) {
  const self = this;
  const lines = sdp.split('\r\n');
  const output = [];
  lines.forEach(function(line) {
    if (line.indexOf('=AS:') !== -1) {
      // strip out all "b=AS:" lines, so we can apply our own bitrate limit
    } else {
      if ((line.indexOf('=rtcp-fb:') !== -1) && config.rtcp && config.rtcp.feedbacks && config.rtcp.feedbacks.length) {
        // only allow supported rtcp feedback types
        let feedback = null;
        const temp = line.split(' ');
        if (temp && temp.length >= 2) {
          feedback = line.substring(temp[0].length + 1);
        }
        if (feedback && config.rtcp.feedbacks.indexOf(feedback) === -1) {
          // strip unsupported feedback
        } else {
          output.push(line);
        }
      } else {
        output.push(line);
      }
    }
  });
//  logger.info('filterSdp: ' + output.join('\r\n'));
  return output.join('\r\n');
}

EchoTestService.prototype.onConnection = function(socket) {
  const self = this;

  socket.on('turnRequest', function() {
    console.log('turnRequest');
    socket.emit('turnResponse', self.config.turn);
  });

  socket.on('echoTestRequest', function(sdp, candidates, uuid) {
    console.log('echoTestRequest');

    if (!sdp || !candidates || !uuid) {
      return socket.emit('echoTestResponse', false, { reason: "missing_mandatory_parameter"});
    }

    self.mediaEngine.createRtpEndpointFromOffer(
      {
        apiContext: "echotest_" + uuid,
        audio: true,
        video: true,
        rtcpCheating: false,
        sdp: sdp,
        loopback: true,
        voiceActivityDetectionMode: 3
      }, function(response) {
        if (response && response.createRtpEndpointResponse && response.createRtpEndpointResponse.rtpEndpoint) {
          console.log('createRtpEndpoint: ', response);
          const answerSdp = response.createRtpEndpointResponse.rtpEndpoint.localDescription.sdp;
          rtpEndpoint = response.createRtpEndpointResponse.rtpEndpoint;
          socket.emit('echoTestResponse', true, { sdp: answerSdp, candidates: rtpEndpoint.localDescription.candidates, duration: self.config.echotest.duration }, uuid);

          const echotest = {
            timer: null,
            uuid: uuid,
            rtpEndpoint: rtpEndpoint,
            statistics: [],
            sdpOffer: sdp,
            candidatesOffer: rtpEndpoint.candidates,
            sdpAnswer: rtpEndpoint.localDescription.sdp,
            candidatesAnswer: rtpEndpoint.localDescription.candidates,
            voiceActivityDetected: false,
            socket: socket
          }
          self.echoTests[rtpEndpoint.id] = echotest;
          echotest.timer = setTimeout(function() {
            if (echotest.rtpEndpoint) {
              self.mediaEngine.destroyRtpEndpoint(rtpEndpoint.id,
                function(msg) {
                  let statistics = null;
                  if (msg && msg.destroyRtpEndpointResponse) {
                    statistics = msg.destroyRtpEndpointResponse.statistics;
                  }
                  delete self.echoTests[rtpEndpoint.id];
                  echotest.rtpEndpoint = null;
                  if (statistics) {
                    console.log('echotest ' + uuid + ' has transmitted ' + statistics.rtpRxOctets + ' bytes.', statistics);
                  }
                  var result = self.processCallStatistics(echotest, 'completed', statistics);
                  socket.emit('echoTestComplete', true, result, uuid);
                }
              );
            }
          }, self.config.echotest.duration * 1000);


        } else {
          socket.emit('echoTestResponse', false, { reason: "unknown_error"}, uuid);
        }
      }
    );

  });
}

module.exports = EchoTestService;
