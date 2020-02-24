'use strict'

var roomName = window.location.hash.substr(1);
console.log(roomName);
var drone = new Scaledrone('W2kIqjAdHe5zpquw');
drone.on('open', function(error){
  if (error) {
    return console.error(error);
  }
  console.log('connected to drone');
});

var room = drone.subscribe(roomName);
room.on('open', function(error){
  if (error) {
    console.error(error);
  } else {
    console.log('Connected to room');
  }
});
room.on('message', function(message){
  console.log('Received message:', message);
  if(message.clientId === drone.clientId){
    console.log('Received self message so ignoring');
    return false;
  }
  message = message.data;
  if(message.type === 'offer'){
    handleOfferSignal(message);
  } else if(message.type === 'answer'){
    handleAnswerSignal(message);
  } else if(message.type === 'candidate'){
    handleICECandidateSignal(message);
  }
});

drone.on('error', error => console.error(error));

function sendSignal(type, data){
  drone.publish({
    room: roomName,
    message: {
      type: type,
      data: data
    }
  });
}

var dataSend = document.querySelector('textarea#send');
var dataReceive = document.querySelector('p#receive');
var startButton = document.querySelector('button#startButton');
var sendButton = document.querySelector('button#sendButton');
var closeButton = document.querySelector('button#closeButton');

startButton.onclick = start;
sendButton.onclick = sendData;
closeButton.onclick = close;

sendButton.disabled = true;
closeButton.disabled = true;

var audioElement = document.getElementById("audio");

var connection;
var pcConstraint;
var connectionConfiguration = {
  iceServers: [
    {
      urls: "stun:stun.stunprotocol.org"
    }
  ]
};
var mediaConstraints = {
  audio: true // We want an audio track
  //video: true // ...and we want a video track
};
var dataChannel;

function start(event){
  console.log('starting connection', event);
  createConnection(true);
  startButton.disabled = true;
  closeButton.disabled = false;
}

function close(event){
  closeConnection();
  startButton.disabled = false;
  closeButton.disabled = true;
}

function createConnection(isStarting) {
  if(connection){
    trace('Can not start connection as it is alrady established');
    return false;
  }

  trace('Creating RTC connection');

  connection = new RTCPeerConnection(connectionConfiguration, pcConstraint);

  connection.onicecandidate = handleICECandidateEvent;
  connection.ontrack = handleTrackEvent;
  connection.onnegotiationneeded = handleNegotiationNeededEvent;
  connection.onremovetrack = handleRemoveTrackEvent;
  connection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  connection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  connection.onsignalingstatechange = handleSignalingStateChangeEvent;

  navigator.mediaDevices.getUserMedia(mediaConstraints)
    .then(function(stream) {
      stream.getTracks().forEach(track => connection.addTrack(track, stream));
    })
    .catch(handleGetUserMediaError);

  // if(isStarting){
  //   dataChannel = connection.createDataChannel('data-channel');
  //   onDataChannelCreated(dataChannel);
  // } else {
  //   connection.ondatachannel = function(event){
  //     dataChannel = event.channel;
  //     onDataChannelCreated(dataChannel);
  //   }
  //   startButton.disabled = true;
  //   closeButton.disabled = false;
  // } 
}

function handleNegotiationNeededEvent(){
  connection.createOffer().then(function(offer) {
    return connection.setLocalDescription(offer);
  })
  .then(function() {
    sendSignal('offer', connection.localDescription);
  })
  .catch(reportError);
}

function handleOfferSignal(message){
  createConnection(false);

  var desc = new RTCSessionDescription(message.data);

  connection.setRemoteDescription(desc).then(function() {
    return navigator.mediaDevices.getUserMedia(mediaConstraints);
  })
  .then(function(stream) {
    stream.getTracks().forEach(track => connection.addTrack(track, stream));
  })
  .then(function() {
    return connection.createAnswer();
  })
  .then(function(answer) {
    return connection.setLocalDescription(answer);
  })
  .then(function() {
    sendSignal('answer', connection.localDescription);
  })
  .catch(handleGetUserMediaError);
}

function handleAnswerSignal(message){
  var desc = new RTCSessionDescription(message.data);
  connection.setRemoteDescription(desc);
}

function handleTrackEvent(event) {
  audioElement.srcObject = event.streams[0];
  startButton.disabled = true;
  closeButton.disabled = false;
}

function handleRemoveTrackEvent(event) {
  var stream = audioElement.srcObject;
  var trackList = stream.getTracks();
 
  if (trackList.length == 0) {
    closeConnection();
  }
}

function handleICECandidateEvent(event){
  trace('ice candidate callback');
  if(event.candidate){
    sendSignal('candidate', event.candidate);
  }
}

function handleICECandidateSignal(message){
  var candidate = new RTCIceCandidate(message.data);

  connection.addIceCandidate(candidate)
    .catch(reportError);
}

function closeConnection(){
  if (connection) {
    connection.ontrack = null;
    connection.onremovetrack = null;
    connection.onremovestream = null;
    connection.onicecandidate = null;
    connection.oniceconnectionstatechange = null;
    connection.onsignalingstatechange = null;
    connection.onicegatheringstatechange = null;
    connection.onnegotiationneeded = null;

    if (audioElement.srcObject) {
      audioElement.srcObject.getTracks().forEach(track => track.stop());
    }

    connection.close();
    connection = null;
  }
}

function handleICEConnectionStateChangeEvent(event) {
  switch(connection.iceConnectionState) {
    case "closed":
    case "failed":
    case "disconnected":
      close();
      break;
  }
}

function handleSignalingStateChangeEvent(event) {
  switch(connection.signalingState) {
    case "closed":
      close();
      break;
  }
};

function handleICEGatheringStateChangeEvent(event) {
  // Our sample just logs information to console here,
  // but you can do whatever you need.
  console.log('ICEGatheringStateChangeEvent', event);
}


function onDataChannelCreated(channel) {
  console.log('onDataChannelCreated:', channel);

  channel.onopen = function() {
    console.log('CHANNEL opened!!!');
    sendButton.disabled = false;
    dataSend.disabled = false;
  };

  channel.onclose = function () {
    console.log('Channel closed.');
    sendButton.disabled = true;
    dataSend.disabled = true;
  }

  channel.onmessage = onChannelMessageCallback;
}

function onChannelMessageCallback(event) {
  trace('Received Message');
  dataReceive.textContent = event.data;
}

function sendData() {
  var data = dataSend.value;
  dataChannel.send(data);
  trace('Sent Data: ' + data);
}

function trace(text) {
  if (text[text.length - 1] === '\n') {
    text = text.substring(0, text.length - 1);
  }
  if (window.performance) {
    var now = (window.performance.now() / 1000).toFixed(3);
    console.log(now + ': ' + text);
  } else {
    console.log(text);
  }
}

function reportError(error){
  console.log("error", error);
}

function handleGetUserMediaError(e) {
  switch(e.name) {
    case "NotFoundError":
      alert("Unable to open your call because no camera and/or microphone" +
            "were found.");
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      // Do nothing; this is the same as the user canceling the call.
      break;
    default:
      alert("Error opening your camera and/or microphone: " + e.message);
      break;
  }

  closeConnection();
}