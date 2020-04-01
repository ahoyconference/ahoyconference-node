var socket = io();
var localCamDeviceId = null;
var localMicDeviceId = null;
var localStreams = {};
var myself = null;
var conferenceId = null;
var conference = {};
var memberList = {};
var memberListElement = document.getElementById('memberList');
var header = document.getElementById('header');
var isConnected = false;
var videos = document.getElementById('videos');
var chat = document.getElementById('chat');

function shareScreen() {
  if (myself.moderator) {
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia()
          .then(function(mediaStream) {
          var stream = { name: "screen", mediaStream: mediaStream  };
          localStreams[stream.name] = stream;
          socket.emit('publishStream', stream.name, true, true);
          mediaStream.oninactive = function() {
            socket.emit('unpublishStream', stream);
            delete localStreams[stream.name];
          }
        })
        .catch(function(error) {
          console.log(error);
        })
    }
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
  var input = document.getElementById('message');
  sendChatMessage(input.value);
  input.value = '';
}

function addChatMessage(msg) {
  console.log(msg);
  if (msg && msg.message && msg.message.text && msg.member) {
    if (msg.member.uuid === myself.uuid) {
      chat.innerHTML += 'me: ' + msg.message.text + '\n';
    } else {
      chat.innerHTML += msg.member.name + ': ' + msg.message.text + '\n';
    }
  }
  chat.scrollTop = chat.scrollHeight;
  return false;
}


function updateDevices() {
  $("#cameraDevice").empty();
  $("#cameraDevice").append('<option value="">(none)</option>')
  $("#micDevice").empty();
  $("#micDevice").append('<option value="">(none)</option>')
  if (navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices().then(
      function(devices) {
        devices.forEach(function(device) {
          if (device.kind === 'videoinput') {
            if (localCamDeviceId === undefined) {
              localCamDeviceId = device.deviceId;
            }
            if (device.deviceId === localCamDeviceId) {
              $("#cameraDevice").append('<option value="' + device.deviceId + '" selected>' + device.label + '</option>')
            } else {
              $("#cameraDevice").append('<option value="' + device.deviceId + '">' + device.label + '</option>')
            }
          } else if (device.kind === 'audioinput') {
            if (localMicDeviceId === undefined) {
              localMicDeviceId = device.deviceId;
            }
            if (device.deviceId === localMicDeviceId) {
              $("#micDevice").append('<option value="' + device.deviceId + '" selected>' + device.label + '</option>')
            } else {
              $("#micDevice").append('<option value="' + device.deviceId + '">' + device.label + '</option>')
            }
          }
        });
      }
    );
  }
}

function updateMemberList() {
  var memberUuids = Object.keys(memberList);
  var list = null;

  var hasAudio = localMicDeviceId != '';
  var isMuted = true;
  var streamUuids = Object.keys(localStreams);
  if (streamUuids.length) {
    streamUuids.forEach(function(streamUuid) {
      var stream = localStreams[streamUuid];
      if (stream.audio) {
        hasAudio = true;
        isMuted = false;
      }
    });
  }
  if (hasAudio) {
    list = '<li class="list-group-item"><b>me</b>' + (isMuted? ' <button type="button" class="btn btn-sm btn-success float-right" onclick="unmuteMember(myself)">Unmute</button>':' <button type="button" class="btn btn-sm btn-danger float-right" onclick="muteMember(myself)">Mute</button>') + '</li>';
  } else {
    list = '<li class="list-group-item"><b>me</b></li>';
  }

  memberUuids.forEach(function(memberUuid) {
    var member = memberList[memberUuid];
    var name = member.name;
    if (memberUuid != myself.uuid) {
      if (member.webrtc) {
        if (member.moderator) {
          name += ' (Moderator)';
        } else {
        }
      } else {
        name += ' (SIP)';
      }
      var hasAudio = false;
      var isMuted = true;
      var streamUuids = Object.keys(member.streams);
      if (streamUuids.length) {
        streamUuids.forEach(function(streamUuid) {
          var stream = member.streams[streamUuid];
          if (stream.audio) {
            hasAudio = true;
            isMuted = false;
          }
        });
      }
      if (hasAudio && myself.moderator) {
        list += '<li class="list-group-item">'+ name + ' <button type="button" class="btn btn-sm btn-danger float-right ' + (isMuted?"disabled":"") + '" onclick="muteMember({\'uuid\':\''+member.uuid+'\'})">Mute</button></li>';

      } else {
        list += '<li class="list-group-item">'+ name + ' </li>';
      }

    }
  });
  memberListElement.innerHTML = list;
}

function addStreamMediaElement(stream, muted, mirrored) {
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
      console.log('video clicked');
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
    videos.append(video);
    return video;
  } else if (stream.audio && !muted) {
    var audio = document.createElement('audio');
    audio.setAttribute('autoplay', 'autoplay');
    audio.setAttribute('id', stream.uuid);
    document.body.append(audio);
    return audio;
  }
}

function removeStreamMediaElement(stream) {
  var media = document.getElementById(stream.uuid);
  if (media) {
    if (media.tagName.toLowerCase() === 'video') {
      videos.removeChild(media);
    } else {
      document.body.removeChild(media);
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

  var localStream = localStreams['camera'];
  if (localStream) {
    removeStreamMediaElement(localStream);
    stopStream(localStream);
    socket.emit('unpublishStream', localStream);
    delete localStreams['camera'];
  }
  localStorage['localMicDeviceId'] = localMicDeviceId;
  localStorage['localCamDeviceId'] = localCamDeviceId;

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
          addStreamMediaElement(localMediaStream, true, true).srcObject = localMediaStream.mediaStream;
        }
        socket.emit('publishStream', localMediaStream.name, localMediaStream.audio, localMediaStream.video);


      }, function (error) {
        console.log(error);
        delete localStorage['localMicDeviceId'];
        delete localStorage['localCamDeviceId'];
      });
    }
}

function registerSocketListeners(socket) {

  socket.on('memberJoined', function(member) {
    memberList[member.uuid] = member;
    updateMemberList();
  })

  socket.on('memberLeft', function(member) {
    delete memberList[member.uuid];
    updateMemberList();
    if (myself.uuid == member.uuid) {
      document.location.reload();
    }
  })

  socket.on('joinConferenceResponse', function(success, members, member, mode, options) {
    console.log(mode);
    if (!success) {
      alert("An error occured while joining the conference. Please try again!");
    } else {
      localMicDeviceId = localStorage['localMicDeviceId'];
      localCamDeviceId = localStorage['localCamDeviceId'];
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
      if ((mode === 'classroom') && !member.moderator) {
        mediaConstraints.video = false;
      }

      conference = { conferenceId: conferenceId, locked: false, options: options };
      header.innerHTML = '<b>Room ' + conferenceId + '</b>';
      // list of conference members (including ourself)
      myself = member;
      memberList = members;
      updateMemberList();

      if (mediaConstraints.audio || mediaConstraints.video) {
        console.log(mediaConstraints);
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
              addStreamMediaElement(localMediaStream, true, true).srcObject = localMediaStream.mediaStream;
            }
            socket.emit('publishStream', localMediaStream.name, localMediaStream.audio, localMediaStream.video);
          },
          function getUserMediaError(error) {
            console.log(error);
          }
        );
      }

      var keys = Object.keys(members);
      keys.forEach(function(memberUuid) {
        if (memberUuid != myself.uuid) {
          Object.keys(members[memberUuid].streams).forEach(function(streamUuid) {
            var stream = members[memberUuid].streams[streamUuid];
            addStreamMediaElement(stream);
            socket.emit('subscribeStream', stream, stream.audio, stream.video);
          });
        }
      });
    }
  })

  socket.on('publishSdpRequest', function(sdp, stream, turn) {
    console.log(turn);
    // the backend sent a SDP offer for publishing our local stream
    if (localStreams[stream.name]) {
      var localStream = localStreams[stream.name];
console.log(turn);
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
    }

  })

  socket.on('subscribeSdpRequest', function(sdp, endpointId, stream, turn) {
    // the backend sent a SDP offer for receiving a remote stream
    console.log(turn);
    var pc = null;
    if (turn) {
      pc = new RTCPeerConnection(turn);
    } else {
      pc = new RTCPeerConnection();
    }

    pc.onaddstream = function(event) {
      var video = document.getElementById(stream.uuid);
      video.srcObject = event.stream;
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
        memberList[member.uuid].streams[stream.uuid] = {active: true, audio: stream.audio, video: stream.video};
        addStreamMediaElement(stream);
        socket.emit('subscribeStream', stream, stream.audio, stream.video);
      } else {
        console.log('member ' + member.uuid + ' stopped sending stream ' + stream.uuid);
        removeStreamMediaElement(stream);
        delete memberList[member.uuid].streams[stream.uuid];
      }
      updateMemberList();
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
      updateMemberList();
    }
  })

  socket.on('conferenceLockStatus', function(locked) {
    if (locked) {
      $('#lockButton').addClass('d-none');
      $('#unlockButton').removeClass('d-none');
    } else {
      $('#unlockButton').addClass('d-none');
      $('#lockButton').removeClass('d-none');
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
