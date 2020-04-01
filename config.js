module.exports = {
messageBus: {
    messageUri: "tcp://127.0.0.1:5001",
    subscriptionUri: "tcp://127.0.0.1:5002"
  },
  ahoymed: {
    zmqUri: "tcp://127.0.0.1:2999",
    zmqEventUri: "tcp://127.0.0.1:2998"
  },
  socketIo: {
    port: 4000
  },
  conferences: {
    "test": {
      mode: "conference",
      password: "test",
      moderatorPassword: "secret",
      options: {
        audioBitrage: 50,
        videoBitrate: 500,
        echoCancellation: true
      }
    }
  },
  sdp: {
    rtcpCheating: false,
    receiveAudio: "\r\n\
v=0\r\n\
o=- 2498272862644297831 2 IN IP4 127.0.0.1\r\n\
s=-\r\n\
t=0 0\r\n\
a=group:BUNDLE audio\r\n\
m=audio 9 RTP/SAVPF 111\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:audio\r\n\
a=sendonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:111 opus/48000/2\r\n\
a=fmtp:111 minptime=10; useinbandfec=1; usedtx=0;\r\n\
a=maxptime:60\r\n\
",

transmitAudio: "\r\n\
v=0\r\n\
o=- 2498272862644297831 2 IN IP4 127.0.0.1\r\n\
s=-\r\n\
t=0 0\r\n\
a=group:BUNDLE audio\r\n\
a=msid-semantic: WMS x4N2tDIFLdNVIItoF8USwuROCFLjADlXqckO\r\n\
m=audio 9 RTP/SAVPF 111\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:audio\r\n\
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=recvonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:111 opus/48000/2\r\n\
a=fmtp:111 minptime=10; useinbandfec=1; usedtx=0;\r\n\
a=maxptime:60\r\n\
",

eceiveVideo: "\r\n\
v=0\r\n\
o=- 2498272862644297831 2 IN IP4 127.0.0.1\r\n\
s=-\r\n\
t=0 0\r\n\
a=group:BUNDLE video\r\n\
a=msid-semantic: WMS x4N2tDIFLdNVIItoF8USwuROCFLjADlXqckO\r\n\
m=video 9 RTP/SAVPF 116 100\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:video\r\n\
a=extmap:2 urn:ietf:params:rtp-hdrext:toffset\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=extmap:4 urn:3gpp:video-orientation\r\n\
a=sendonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:100 VP8/90000\r\n\
a=rtcp-fb:100 ccm fir\r\n\
a=rtcp-fb:100 nack\r\n\
a=rtcp-fb:100 nack pli\r\n\
a=rtcp-fb:100 goog-remb\r\n\
a=rtpmap:116 red/90000\r\n\
",

transmitVideo: "\r\n\
v=0\r\n\
o=- 2498272862644297831 2 IN IP4 127.0.0.1\r\n\
s=-\r\n\
t=0 0\r\n\
a=group:BUNDLE video\r\n\
a=msid-semantic: WMS x4N2tDIFLdNVIItoF8USwuROCFLjADlXqckO\r\n\
m=video 9 RTP/SAVPF 116 100\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:video\r\n\
a=extmap:2 urn:ietf:params:rtp-hdrext:toffset\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=extmap:4 urn:3gpp:video-orientation\r\n\
a=recvonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:100 VP8/90000\r\n\
a=rtcp-fb:100 ccm fir\r\n\
a=rtcp-fb:100 nack\r\n\
a=rtcp-fb:100 nack pli\r\n\
a=rtcp-fb:100 goog-remb\r\n\
a=rtpmap:116 red/90000\r\n\
",

    receiveAudioVideo: "\r\n\
v=0\r\n\
o=- 2498272862644297831 2 IN IP4 127.0.0.1\r\n\
s=-\r\n\
t=0 0\r\n\
a=group:BUNDLE audio video\r\n\
a=msid-semantic: WMS x4N2tDIFLdNVIItoF8USwuROCFLjADlXqckO\r\n\
m=audio 9 RTP/SAVPF 111\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:audio\r\n\
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=sendonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:111 opus/48000/2\r\n\
a=fmtp:111 minptime=10; useinbandfec=1; usedtx=0;\r\n\
a=maxptime:60\r\n\
m=video 9 RTP/SAVPF 116 100\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:video\r\n\
a=extmap:2 urn:ietf:params:rtp-hdrext:toffset\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=extmap:4 urn:3gpp:video-orientation\r\n\
a=sendonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:100 VP8/90000\r\n\
a=rtcp-fb:100 ccm fir\r\n\
a=rtcp-fb:100 nack\r\n\
a=rtcp-fb:100 nack pli\r\n\
a=rtcp-fb:100 goog-remb\r\n\
a=rtpmap:116 red/90000\r\n\
",

    transmitAudioVideo: "\r\n\
v=0\r\n\
o=- 2498272862644297831 2 IN IP4 127.0.0.1\r\n\
s=-\r\n\
t=0 0\r\n\
a=group:BUNDLE audio video\r\n\
a=msid-semantic: WMS x4N2tDIFLdNVIItoF8USwuROCFLjADlXqckO\r\n\
m=audio 9 RTP/SAVPF 111\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:audio\r\n\
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=recvonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:111 opus/48000/2\r\n\
a=fmtp:111 minptime=10; useinbandfec=1; usedtx=0;\r\n\
a=maxptime:60\r\n\
m=video 9 RTP/SAVPF 116 100\r\n\
c=IN IP4 0.0.0.0\r\n\
a=rtcp:9 IN IP4 0.0.0.0\r\n\
a=ice-ufrag:Ipdz+ww6UqDI1Qoc\r\n\
a=ice-pwd:rBXBqKKyhA+vrIouhx0bdSzM\r\n\
a=fingerprint:sha-256 37:02:66:4E:EC:95:27:06:BC:EB:3C:9E:DD:85:26:0E:BC:A0:1A:34:55:05:30:85:51:6B:0D:1A:50:42:D1:39\r\n\
a=setup:actpass\r\n\
a=mid:video\r\n\
a=extmap:2 urn:ietf:params:rtp-hdrext:toffset\r\n\
a=extmap:3 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time\r\n\
a=extmap:4 urn:3gpp:video-orientation\r\n\
a=recvonly\r\n\
a=rtcp-mux\r\n\
a=rtpmap:100 VP8/90000\r\n\
a=rtcp-fb:100 ccm fir\r\n\
a=rtcp-fb:100 nack\r\n\
a=rtcp-fb:100 nack pli\r\n\
a=rtcp-fb:100 goog-remb\r\n\
a=rtpmap:116 red/90000\r\n\
"
  }
};
