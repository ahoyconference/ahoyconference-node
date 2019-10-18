var socket = io();
var localStreams = {};
var localPc = null;
var myself = null;
var conferenceId = null;
var conferencePassword = null
var conferenceUsername = null;;
var memberList = {};
var memberListElement = document.getElementById('memberList');

function joinConference() {
  if (conferenceId) return;
  conferenceId = document.getElementById('conferenceId').value;
  conferencePassword = document.getElementById('password').value;
  conferenceUsername = document.getElementById('name').value;
  if (conferenceId) {
    socket.emit('joinConferenceRequest', conferenceId, conferencePassword, conferenceUsername);
  }
}

function updateMemberList() {
  var memberUuids = Object.keys(memberList);
  var list = myself.name + ' (you)';
  memberUuids.forEach(function(memberUuid) {
    if (memberUuid != myself.uuid) {
      if (memberList[memberUuid].webrtc) {
        list += "\n" + memberList[memberUuid].name + ' (WebRTC)';
      } else {
        list += "\n" + memberList[memberUuid].name + ' (SIP)';
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
    document.body.append(video);
    return video;
  } else if (stream.audio) {
    var audio = document.createElement('audio');
    audio.setAttribute('autoplay', 'autoplay');
    audio.setAttribute('id', stream.uuid);
    document.body.append(audio);
    return audio;
  }
}

function removeStreamMediaElement(stream) {
  var media = document.getElementById(stream.uuid);
  document.body.removeChild(media);
}

socket.on('connect', function() {

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

  socket.on('joinConferenceResponse', function(success, members, member) {
    if (!success) {
      alert("An error occured while joining the conference. Please try again!");
    } else {
      // list of conference members (including ourself)
      myself = member;
      memberList = members;
      updateMemberList();
      navigator.getUserMedia(
        { audio: true, video: true },
        function getUserMediaSuccess(stream) {
          var cameraStream = { name: "camera", mediaStream: stream, uuid: 'local_camera', audio: true, video: true };
	  localStreams[cameraStream.name] = cameraStream;
          addStreamMediaElement(cameraStream, true, true).srcObject = cameraStream.mediaStream;
          socket.emit('publishStream', cameraStream.name, true, true);
        },
        function getUserMediaError(error) {
          console.log(error);
        }
      );
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

  socket.on('publishSdpRequest', function(sdp, stream) {
    // the backend sent a SDP offer for publishing our local stream
    localPc = new RTCPeerConnection();
    localPc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: sdp }),
      function setRemoteOk() {
        var localStream = localStreams[stream.name];
        localPc.addStream(localStream.mediaStream);
        localPc.createAnswer(
          function createAnswerOk(description) {
            localPc.setLocalDescription(description,
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
  })

  socket.on('subscribeSdpRequest', function(sdp, endpointId, stream) {
    // the backend sent a SDP offer for receiving a remote stream
    var pc = new RTCPeerConnection();
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
    // the status of a stream changed
    if (member.uuid != myself.uuid) {
      if (active) {
        console.log('member ' + member.uuid + ' started sending stream ' + stream.uuid + ' (audio: ' + stream.audio + ', video: ' + stream.video + ')');
        addStreamMediaElement(stream);
        socket.emit('subscribeStream', stream, stream.audio, stream.video);
      } else {
        console.log('member ' + member.uuid + ' stopped sending stream ' + stream.uuid);
        removeStreamMediaElement(stream);
      }
    }
  })

})