var socket = io();
var localCamDeviceId = null;
var localMicDeviceId = null;
var localOutputDeviceId = null;
var localStreams = {};
var myself = null;
var conferenceId = null;
var conference = {};
var memberList = {};
var isConnected = false;

function getMemberStreamByUuid(uuid) {
  var stream = null;
  var keys = Object.keys(memberList);
  keys.forEach(function(memberUuid) {
    var member = memberList[memberUuid];
    if (member.streams[uuid]) {
      stream = member.streams[uuid];
    }
  });
  return stream;
}

function shareScreen() {
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia()
        .then(function(mediaStream) {
        var stream = { name: "screen", mediaStream: mediaStream, video: true  };
        localStreams[stream.name] = stream;
        socket.emit('publishStream', stream.name, true, true);
        mediaStream.oninactive = function() {
          socket.emit('unpublishStream', stream);
          delete localStreams[stream.name];
          renderMediaStreams();
        }
      })
      .catch(function(error) {
        console.log(error);
      })
  }
}

function leaveConference() {
  socket.disconnect();
  document.location.href = '/?' + conferenceId;
}

function joinConference(conference, name, password) {
  conferenceId = conference;
  if (conference) {
    socket.emit('joinConferenceRequest', conference, password, name);
  }
}

function lockConference() {
  socket.emit('lockConference');
}

function unlockConference() {
  socket.emit('unlockConference');
}

function muteMember(member) {
  socket.emit('muteMember', member);
}

function unmuteMember(member) {
  socket.emit('unmuteMember', member);
}

function kickMember(member) {
  socket.emit('kickMember', member);
}

function sendChatMessage(message) {
  socket.emit('chatMessage', { text: message });
}

function sendMessage() {
  sendChatMessage($('#message').val());
  $('#message').val('');
}

function addChatMessage(msg) {
  if (msg && msg.message && msg.message.text && msg.member) {
    if (msg.member.uuid === myself.uuid) {
      $('#chat').html($('#chat').html() +  'me: ' + msg.message.text + '\n');
    } else {
      $('#chat').html($('#chat').html() + msg.member.name + ': ' + msg.message.text + '\n');
    }
  }
  $('#chat').prop('scrollTop', $('#chat').prop('scrollHeight'));
  return false;
}


function updateDevices() {
  if (HTMLMediaElement.prototype.setSinkId !== undefined) {
    $('#outputDeviceComponent').removeClass('d-none');
  }

  $('#cameraDevice').empty();
  $('#cameraDevice').append('<option value="">(none)</option>')
  $('#micDevice').empty();
  $('#micDevice').append('<option value="">(none)</option>')
  $('#outputDevice').empty();

  if (navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices().then(
      function(devices) {
        devices.forEach(function(device) {
          if (device.kind === 'videoinput') {
            if (localCamDeviceId === undefined) {
              localCamDeviceId = device.deviceId;
            }
            if (device.deviceId === localCamDeviceId) {
              $('#cameraDevice').append('<option value="' + device.deviceId + '" selected>' + device.label + '</option>')
            } else {
              $('#cameraDevice').append('<option value="' + device.deviceId + '">' + device.label + '</option>')
            }
          } else if (device.kind === 'audioinput') {
            if (localMicDeviceId === undefined) {
              localMicDeviceId = device.deviceId;
            }
            if (device.deviceId === localMicDeviceId) {
              $('#micDevice').append('<option value="' + device.deviceId + '" selected>' + device.label + '</option>')
            } else {
              $('#micDevice').append('<option value="' + device.deviceId + '">' + device.label + '</option>')
            }
          } else if (device.kind === 'audiooutput') {
            if (localOutputDeviceId === undefined) {
              localOutputDeviceId = device.deviceId;
            }
            if (device.deviceId === localOutputDeviceId) {
              $('#outputDevice').append('<option value="' + device.deviceId + '" selected>' + device.label + '</option>');
            } else {
              $('#outputDevice').append('<option value="' + device.deviceId + '">' + device.label + '</option>');
            }
          }
        });
      }
    );
  }
}

function muteMic() {
  var localStream = localStreams['camera'];
  if (localStream &&localStream.mediaStream) {
    var tracks = localStream.mediaStream.getTracks();
    if (tracks) {
      tracks.forEach(function(track) {
        if (track.kind === 'audio') {
          track.enabled = false;
          localStream.audio = false;
          renderMediaStreams();
        }
      });
    }

    $('#muteMicButton').addClass('d-none');
    $('#unmuteMicButton').removeClass('d-none');
  }
}

function unmuteMic() {
  var localStream = localStreams['camera'];
  if (localStream && localStream.mediaStream) {
    var tracks = localStream.mediaStream.getTracks();
    if (tracks) {
      tracks.forEach(function(track) {
        if (track.kind === 'audio') {
          track.enabled = true;
          localStream.audio = true;
          renderMediaStreams();
        }
      });
    }

    $('#muteMicButton').removeClass('d-none');
    $('#unmuteMicButton').addClass('d-none');
  }
}

function muteCam() {
  var localStream = localStreams['camera'];
  if (localStream &&localStream.mediaStream) {
    var tracks = localStream.mediaStream.getTracks();
    if (tracks) {
      tracks.forEach(function(track) {
        if (track.kind === 'video') {
          track.enabled = false;
          renderMediaStreams();
        }
      });
    }

    $('#muteCamButton').addClass('d-none');
    $('#unmuteCamButton').removeClass('d-none');
  }
}

function unmuteCam() {
  var localStream = localStreams['camera'];
  if (localStream && localStream.mediaStream) {
    var tracks = localStream.mediaStream.getTracks();
    if (tracks) {
      tracks.forEach(function(track) {
        if (track.kind === 'video') {
          track.enabled = true;
          renderMediaStreams();
        }
      });
    }

    $('#muteCamButton').removeClass('d-none');
    $('#unmuteCamButton').addClass('d-none');
  }
}

function renderMediaStreams() {
  var streams = {};
  $('#media').empty();

  var keys = Object.keys(memberList);
  keys.forEach(function(memberUuid) {
    if (memberUuid != myself.uuid) {
      var member = memberList[memberUuid];
      if (Object.keys(member.streams).length > 0) {
        Object.keys(member.streams).forEach(function(streamUuid) {
          var stream = member.streams[streamUuid];
          if (stream.mediaStream) {
            stream.displayName = member.name;
            if (stream.name === 'screen') {
              stream.displayName += ' (screen sharing)';
            } else if (!stream.audio) {
              stream.displayName += ' (no audio)';
            }
            streams[member.name + '_' + member.uuid + '_' + stream.uuid] = stream;
          }
        });
      } else {
        // provide a dummy stream for participants without media, so they are visible to other participants
        var stream = { name: '', uuid: 'dummy', audio: false, video: false, active: true, displayName: (member.name + ' (no audio)')};
        streams[member.name + '_' + member.uuid + '_' + stream.uuid] = stream;
      }
    }
  });

  var size = 3;
  var localStreamNames = Object.keys(localStreams);
  var streamNames = Object.keys(streams);
  var numberOfStreams = localStreamNames.length + streamNames.length;

  if (localStreamNames.length === 0) {
    numberOfStreams++;
  }
  if (numberOfStreams == 1) {
    size = 6;
  } else if (numberOfStreams <= 4) {
    size = 12 / numberOfStreams;
  }

  if (localStreamNames.length > 0) {
    localStreamNames.forEach(function(streamName) {
      var stream = localStreams[streamName];
      if (stream) {
        stream.displayName = myself.name;
        if (stream.name === 'screen') {
          stream.displayName += ' (screen sharing)';
        } else if (!stream.audio) {
          stream.displayName += ' (no audio)';
        }
        var element = addStreamMediaElement(stream, true, (stream.name === 'screen')?false:true, 'col-' + size);
        if (element) {
          element.srcObject = stream.mediaStream;
        }
      }
    });
  } else {
    // if we are not sharing any media provide a dummy stream, so we are visible in the UI
    var dummyStream = { name: '', uuid: 'dummy', audio: false, video: false, active: true, displayName: (myself.name + ' (no audio)')};
    addStreamMediaElement(dummyStream, true, false, 'col-' + size);
  }

  streamNames.forEach(function(streamName) {
    var stream = streams[streamName];
    if (stream) {
      var element = addStreamMediaElement(stream, false, false, 'col-' + size);
      if (element) {
        element.srcObject = stream.mediaStream;
      }
    }
  });
}

function addStreamMediaElement(stream, muted, mirrored, size) {
  var col = null;
  if (size) {
    col = $('<div class="' + size + '" id="media-' + stream.uuid + '"></div>');
  } else {
    col = $('<div class="col-3" id="media-' + stream.uuid + '"></div>');
  }

  var div = $('<div class="alert alert-secondary" style="padding: 8px;"></div>');

  if (stream.video) {
    var video = document.createElement('video');
    video.setAttribute('autoplay', 'autoplay');
    if (muted) {
      video.setAttribute('muted', 'muted');
      video.muted = true;
    }
    video.setAttribute('playsinline', 'playsinline');
    video.setAttribute('id', stream.uuid);
    if (mirrored) {
      video.style.cssText = "-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;";
    }
    video.style.width= "100%";
    video.addEventListener('click', function() {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (video.mozRequestFullScreen) { /* Firefox */
        video.mozRequestFullScreen();
      } else if (video.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
        video.webkitRequestFullscreen();
      } else if (video.msRequestFullscreen) { /* IE/Edge */
        video.msRequestFullscreen();
      }
    });

    if (typeof video.sinkId !== 'undefined') {
      if (localOutputDeviceId) {
        video.setSinkId(localOutputDeviceId)
          .then(() => {
            console.log('setSinkId: ' + localOutputDeviceId + ' on ' + video);
          })
          .catch((error) => {
            console.log(error);
          })
      }
    }

    div.append(video);
    div.append('<p class="mb-0"><strong>' + stream.displayName + '</strong></p>');
    col.append(div);

    $('#media').append(col);
    return video;
  } else {
    var image = $('<img src="img/avatar.png" width="100%">');
    div.append(image);
    div.append('<p class="mb-0"><strong>' + stream.displayName + '</strong></p>');
    col.append(div);

    if (stream.audio && !muted) {
      var audio = document.createElement('audio');
      audio.setAttribute('autoplay', 'autoplay');
      audio.setAttribute('id', stream.uuid);

      if (typeof audio.sinkId !== 'undefined') {
        if (localOutputDeviceId) {
          console.log('setSinkId: ' + localOutputDeviceId);
          audio.setSinkId(localOutputDeviceId);
        }
      }

      col.append(audio);
      $('#media').append(col);
      return audio;
    } else {
      $('#media').append(col);
    }
  }
}

function stopStream(stream) {
  var tracks = stream.mediaStream.getTracks();
  tracks.forEach(function(track) {
    track.stop();
  });
}

function applyDeviceChanges() {
  localCamDeviceId = $('#cameraDevice').val();
  localMicDeviceId = $('#micDevice').val();
  localOutputDeviceId = $('#outputDevice').val();

  var localStream = localStreams['camera'];
  if (localStream) {
    stopStream(localStream);
    socket.emit('unpublishStream', localStream);
    delete localStreams['camera'];
    renderMediaStreams();
  }
  localStorage['localMicDeviceId'] = localMicDeviceId;
  localStorage['localCamDeviceId'] = localCamDeviceId;
  localStorage['localOutputDeviceId'] = localOutputDeviceId;

  if ((localCamDeviceId != '') || (localMicDeviceId != '')) {
    var mediaConstraints = {};
    if (localMicDeviceId != '') {
      mediaConstraints.audio = {
        deviceId: {
          exact: localMicDeviceId
        }
      };
      if (conference.options && conference.options.echoCancellation !== undefined) {
        mediaConstraints.audio['echoCancellation']  = conference.options.echoCancellation;
      }
    }
    if (localCamDeviceId != '') {
      mediaConstraints.video = {
        deviceId: {
          exact: localCamDeviceId
        }
      };
    }

    navigator.getUserMedia(mediaConstraints,
      function(stream) {
        localStorage['localMicDeviceId'] = localMicDeviceId;
        localStorage['localCamDeviceId'] = localCamDeviceId;

        var localMediaStream = { name: "camera", mediaStream: stream, uuid: 'local_camera', audio: (localMicDeviceId != '')?true:false, video: (localCamDeviceId != '')?true:false };
        localStreams[localMediaStream.name] = localMediaStream;
        if (localMediaStream.video) {
          $('#muteCamButton').removeClass('d-none');
          $('#unmuteCamButton').addClass('d-none');
        } else {
          $('#muteCamButton').addClass('d-none');
          $('#unmuteCamButton').addClass('d-none');
        }
        if (localMediaStream.audio) {
          $('#muteMicButton').removeClass('d-none');
          $('#unmuteMicButton').addClass('d-none');
        } else {
          $('#muteMicButton').addClass('d-none');
          $('#unmuteMicButton').addClass('d-none');
        }
        socket.emit('publishStream', localMediaStream.name, localMediaStream.audio, localMediaStream.video);
      }, function (error) {
        // TODO add error modal
        console.log(error);
        delete localStorage['localMicDeviceId'];
        delete localStorage['localCamDeviceId'];
      });
    } else {
      $('#muteCamButton').addClass('d-none');
      $('#unmuteCamButton').addClass('d-none');
      $('#muteMicButton').addClass('d-none');
      $('#unmuteMicButton').addClass('d-none');
    }
}

function registerSocketListeners(socket) {

  socket.on('memberJoined', function(member) {
    memberList[member.uuid] = member;
  })

  socket.on('memberLeft', function(member) {
    delete memberList[member.uuid];
    renderMediaStreams();
    if (myself.uuid == member.uuid) {
      document.location.reload();
    }
  })

  socket.on('joinConferenceResponse', function(success, members, member, mode, options) {
    if (!success) {
      alert("An error occured while joining the conference. Please try again!");
    } else {
      if (adapter.browserDetails.browser !== 'safari') {
        $('#screenShareButton').removeClass('d-none');
      }

      localMicDeviceId = localStorage['localMicDeviceId'];
      localCamDeviceId = localStorage['localCamDeviceId'];
      localOutputDeviceId = localStorage['localOutputDeviceId'];
      var mediaConstraints = {};
      if (localMicDeviceId === undefined) {
        mediaConstraints.audio = { };
      } else if (localMicDeviceId != '') {
        mediaConstraints.audio = {
          deviceId: {
            exact: localMicDeviceId
          }
        };
      }
      if (mediaConstraints.audio) {
        if (options && options.echoCancellation !== undefined) {
          mediaConstraints.audio['echoCancellation']  = options.echoCancellation;
        }
      }
      if (localCamDeviceId === undefined) {
        mediaConstraints.video = true;
      } else if (localCamDeviceId != '') {
        mediaConstraints.video = {
          deviceId: {
            exact: localCamDeviceId
          }
        };
      }

      conference = { conferenceId: conferenceId, locked: false, options: options };
      $('#header').html('<b>Room ' + conference.conferenceId + '</b>');
      // list of conference members (including ourself)
      myself = member;
      memberList = members;

      if (mediaConstraints.audio || mediaConstraints.video) {
        navigator.getUserMedia(
          mediaConstraints,
          function getUserMediaSuccess(stream) {
            var localMediaStream = { name: "camera", mediaStream: stream, uuid: 'local_camera', audio: false, video: false };
            var tracks = stream.getTracks();
            tracks.forEach(function(track) {
              if (track.kind === 'audio') {
                localMediaStream.audio = true;
              } else if (track.kind === 'video') {
                localMediaStream.video = true;
              }
            });
            localStreams[localMediaStream.name] = localMediaStream;
            if (localMediaStream.video) {
              $('#muteCamButton').removeClass('d-none');
              $('#unmuteCamButton').addClass('d-none');
            } else {
              $('#muteCamButton').addClass('d-none');
              $('#unmuteCamButton').addClass('d-none');
            }
            if (localMediaStream.audio) {
              $('#muteMicButton').removeClass('d-none');
              $('#unmuteMicButton').addClass('d-none');
            } else {
              $('#muteMicButton').addClass('d-none');
              $('#unmuteMicButton').addClass('d-none');
            }
            socket.emit('publishStream', localMediaStream.name, localMediaStream.audio, localMediaStream.video);
          },
          function getUserMediaError(error) {
            console.log(error);
          }
        );
      }

      var keys = Object.keys(members);
      if (keys.length > 1) {
        keys.forEach(function(memberUuid) {
          if (memberUuid != myself.uuid) {
            Object.keys(members[memberUuid].streams).forEach(function(streamUuid) {
              var stream = members[memberUuid].streams[streamUuid];
              socket.emit('subscribeStream', stream, stream.audio, stream.video);
            });
          }
        });
      } else {
        renderMediaStreams();
      }
    }
  })

  socket.on('publishSdpRequest', function(sdp, stream, turn) {
    // the backend sent a SDP offer for publishing our local stream
    if (localStreams[stream.name]) {
      var localStream = localStreams[stream.name];
      if (turn) {
        localStream.pc = new RTCPeerConnection(turn);
      } else {
        localStream.pc = new RTCPeerConnection();
      }
      localStream.pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: sdp }),
        function setRemoteOk() {
          var localStream = localStreams[stream.name];
          localStream.pc.addStream(localStream.mediaStream);
          localStream.pc.createAnswer(
            function createAnswerOk(description) {
              localStream.pc.setLocalDescription(description,
                function setLocalOk() {
                  socket.emit('publishSdpResponse', description.sdp, stream.rxRtpEndpointId, stream.uuid);
                },
                function setLocalError(error) {
                  console.log(error);
                }
              )
            },
            function createAnswerError(error) {
              console.log(error);
            }
          );
        },
        function setRemoteError(error) {
          console.log(error);
        }
      );
      renderMediaStreams();
    }

  })

  socket.on('subscribeSdpRequest', function(sdp, endpointId, stream, turn) {
    // the backend sent a SDP offer for receiving a remote stream
    var pc = null;
    if (turn) {
      pc = new RTCPeerConnection(turn);
    } else {
      pc = new RTCPeerConnection();
    }

    pc.onaddstream = function(event) {
      var video = document.getElementById(stream.uuid);
      if (video) {
        video.srcObject = event.stream;
      }
      var memberStream = getMemberStreamByUuid(stream.uuid);
      if (memberStream) {
        memberStream.mediaStream = event.stream;
        renderMediaStreams();
      }
    };
    pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: sdp }),
      function setRemoteOk() {
        pc.createAnswer(
          function createAnswerOk(description) {
            pc.setLocalDescription(description,
              function setLocalOk() {
                socket.emit('subscribeSdpResponse', description.sdp, endpointId, stream);
              },
              function setLocalError(error) {
                console.log(error);
              }
            )
          },
          function createAnswerError(error) {
            console.log(error);
          }
        );
      },
      function setRemoteError(error) {
        console.log(error);
      }
    );
  })

  socket.on('streamStatus', function(stream, active, member) {
    console.log('streamStatus active ' + active + ' member ' + JSON.stringify(member) + ' audio ' +stream.audio + ' video ' + stream.video);
    // the status of a stream changed
    if (member.uuid != myself.uuid) {
      if (active) {
        console.log('member ' + member.uuid + ' started sending stream ' + stream.uuid + ' (audio: ' + stream.audio + ', video: ' + stream.video + ')');
        memberList[member.uuid].streams[stream.uuid] = {active: true, audio: stream.audio, video: stream.video, uuid: stream.uuid, name: stream.name};
        socket.emit('subscribeStream', stream, stream.audio, stream.video);
      } else {
        console.log('member ' + member.uuid + ' stopped sending stream ' + stream.uuid);
        delete memberList[member.uuid].streams[stream.uuid];
        renderMediaStreams();
      }
    } else {
      if (localStreams[stream.name]) {
        var localStream = localStreams[stream.name];
        localStream.audio = stream.audio;
        localStream.video = stream.video;

        localStream.active = active;
        if (!active) {
          if (localStream.pc) {
            try {
              localStream.pc.close();
              localStream.pc = null;
            } catch (error) {

            }
          }
        }
      }
    }
  })

  socket.on('conferenceLockStatus', function(locked) {
    if (locked) {
      $('#lockButton').addClass('d-none');
      $('#unlockButton').removeClass('d-none');
      $('#header').html('<b>Room ' + conference.conferenceId + ' (locked)</b>');
    } else {
      $('#unlockButton').addClass('d-none');
      $('#lockButton').removeClass('d-none');
      $('#header').html('<b>Room ' + conference.conferenceId + '</b>');
    }
  });

  socket.on('chatMessage', function(msg) {
    addChatMessage(msg);
  });
}

socket.on('reconnect', function() {
  console.log('reconnected');
  setTimeout(function() {
    document.location.reload();
  }, 1000);
});

socket.on('disconnect', function() {
});

socket.on('connect', function() {
  if (!isConnected) {
    registerSocketListeners(socket);
    isConnected = true;
  }
})
