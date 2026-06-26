// ──────────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIG
// ──────────────────────────────────────────────────────────────────────────────

var firebaseConfig = {
  apiKey: "AIzaSyBeQR-07p_gkN1ygr49rh-PSI-pRsdmoDw",
  authDomain: "chat-82a4b.firebaseapp.com",
  databaseURL: "https://chat-82a4b-default-rtdb.firebaseio.com",
  projectId: "chat-82a4b",
  storageBucket: "chat-82a4b.appspot.com"
};
firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.database();
var storage = firebase.storage();

// ──────────────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────────────

var uid = null;
var myUsername = '';
var currentChatUid = null;
var currentChat = null;
var currentChatType = null;
var currentChatName = '';
var currentGroupId = null;
var messageListeners = [];
var typingTimeout = null;
var isSending = false;
var cameraStream = null;
var memberColors = {};
var lastRenderId = 0;
var mediaRecorder = null;
var audioChunks = [];
var isRecording = false;
var replyingTo = null;
var colorPalette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

// Pagination State
var messageLimit = 20;
var isLoadingMore = false;
var hasMoreMessages = true;
var firstMessageKey = null;

// Encryption key for AES-256
var encryptionKey = 'SecureChat2024!';

// WebRTC State
var peerConnections = {}; // Map of uid -> RTCPeerConnection
var localStream = null;
var callId = null;
var isCallActive = false;
var callType = 'dm'; // 'dm' or 'group'
var rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Track message IDs to avoid duplicate notifications
var seenMessageIds = new Set();

function encryptMessage(text) {
  try {
    return CryptoJS.AES.encrypt(text, encryptionKey).toString();
  } catch (e) {
    console.error('Encryption error:', e);
    return text;
  }
}

function decryptMessage(encryptedText) {
  try {
    var bytes = CryptoJS.AES.decrypt(encryptedText, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('Decryption error:', e);
    return encryptedText;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────────────────────────────────────────

auth.onAuthStateChanged(function(user) {
  if (user) {
    uid = user.uid;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainContainer').classList.add('active');
    initUser();
    requestNotificationPermission();
  } else {
    uid = null;
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainContainer').classList.remove('active');
  }
});

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(el => el.classList.remove('active'));
  document.querySelector('.auth-tab[onclick*="' + tab + '"]').classList.add('active');
  document.getElementById(tab + 'Form').classList.add('active');
  document.getElementById(tab + 'Error').style.display = 'none';
}

function doLogin() {
  var input = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!input || !password) {
    errEl.textContent = 'Please fill in all fields';
    errEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  auth.signInWithEmailAndPassword(input, password).catch(function(e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-email') {
      return db.ref('usernames/' + input.toLowerCase()).once('value').then(function(snap) {
        if (!snap.exists()) throw new Error('User not found');
        var email = snap.val().email;
        return auth.signInWithEmailAndPassword(email, password);
      });
    }
    throw e;
  }).catch(function(e) {
    var msg = e.message;
    if (e.code === 'auth/wrong-password') msg = 'Incorrect password';
    else if (e.code === 'auth/user-not-found') msg = 'User not found';
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Sign In';
  });
}

function doSignup() {
  var username = document.getElementById('signupUsername').value.trim();
  var email = document.getElementById('signupEmail').value.trim();
  var password = document.getElementById('signupPassword').value;
  var errEl = document.getElementById('signupError');
  errEl.style.display = 'none';

  if (!username || !email || !password) {
    errEl.textContent = 'Please fill in all fields';
    errEl.style.display = 'block';
    return;
  }

  if (username.length < 3) {
    errEl.textContent = 'Username must be at least 3 characters';
    errEl.style.display = 'block';
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errEl.textContent = 'Only letters, numbers, and underscores allowed';
    errEl.style.display = 'block';
    return;
  }

  if (password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters';
    errEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  var usernameLower = username.toLowerCase();
  db.ref('usernames/' + usernameLower).once('value').then(function(snap) {
    if (snap.exists()) {
      errEl.textContent = 'Username already taken';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create Account';
      return Promise.reject(new Error('Username taken'));
    }

    return auth.createUserWithEmailAndPassword(email, password).then(function(result) {
      var newUid = result.user.uid;
      var updates = {};
      updates['users/' + newUid] = {
        username: username,
        usernameLower: usernameLower,
        email: email,
        createdAt: Date.now()
      };
      updates['usernames/' + usernameLower] = { uid: newUid, email: email };
      return db.ref().update(updates);
    });
  }).catch(function(e) {
    if (e.message === 'Username taken') return;
    var msg = e.message;
    if (e.code === 'auth/email-already-in-use') msg = 'Email already in use';
    else if (e.code === 'auth/invalid-email') msg = 'Invalid email address';
    else if (e.code === 'auth/weak-password') msg = 'Password too weak';
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Create Account';
  });
}

function doLogout() {
  if (!confirm('Sign out?')) return;
  clearMessageListeners();
  auth.signOut();
}

// ──────────────────────────────────────────────────────────────────────────────
// USER INIT
// ──────────────────────────────────────────────────────────────────────────────

function initUser() {
  var userRef = db.ref('users/' + uid);
  userRef.once('value').then(function(snap) {
    if (!snap.exists()) return;
    var data = snap.val();
    myUsername = data.username || '';
    updateUsernameDisplay();
    initializeProfileAvatar();
    setupPresence();
    loadContacts();
    loadGroups();
    listenForIncomingCalls();
  });
}

function initializeProfileAvatar() {
  if (!uid) return;
  var avatarEl = document.getElementById('myAvatar');
  if (!avatarEl) return;
  
  // Set initial avatar with first letter
  var firstLetter = (myUsername || 'U')[0].toUpperCase();
  avatarEl.innerHTML = firstLetter;
  
  // Try to load profile image
  db.ref('users/' + uid + '/profileImage').once('value').then(function(snap) {
    if (snap.exists() && avatarEl) {
      var profileImage = snap.val();
      avatarEl.innerHTML = '<img src="' + profileImage + '" alt="Profile" style="width:100%; height:100%; border-radius:8px; object-fit:cover;">';
    }
  }).catch(function(err) {
    console.error('Error loading profile image:', err);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// VIDEO CALL LOGIC
// ──────────────────────────────────────────────────────────────────────────────

function listenForIncomingCalls() {
  // DM Calls
  db.ref('calls').on('child_added', function(snap) {
    var call = snap.val();
    if (call.receiver === uid && call.status === 'pending') {
      callId = snap.key;
      callType = 'dm';
      document.getElementById('callerName').textContent = (call.senderName || 'Someone') + ' is calling...';
      document.getElementById('incomingCallModal').classList.add('open');
      setTimeout(() => { if (!isCallActive && callId === snap.key) rejectCall(); }, 30000);
    }
  });

  // Group Calls
  db.ref('groupCalls').on('child_added', function(snap) {
    var call = snap.val();
    // Check if I am a member of this group
    db.ref('groupMembers/' + uid + '/' + snap.key).once('value').then(mSnap => {
      if (mSnap.exists() && call.status === 'active' && call.sender !== uid) {
        callId = snap.key;
        callType = 'group';
        document.getElementById('callerName').textContent = 'Group call in ' + (call.groupName || 'Group');
        document.getElementById('incomingCallModal').classList.add('open');
      }
    });
  });
}

async function startVideoCall() {
  if (isCallActive) {
    if (!confirm('End current call and start a new one?')) return;
    endCall();
  }
  
  callId = currentChat;
  callType = currentChatType;
  isCallActive = true;
  document.getElementById('videoCallOverlay').classList.add('open');
  document.getElementById('videoGrid').innerHTML = '';
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
    
    if (callType === 'dm') {
      setupPeerConnection(currentChatUid, currentChatName || 'User');
      var pc = peerConnections[currentChatUid];
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await db.ref('calls/' + callId).set({
        sender: uid,
        senderName: myUsername,
        receiver: currentChatUid,
        status: 'pending',
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        muted: { [uid]: false }
      });
      
      listenToCallSignals(callId, currentChatUid);
    } else {
      // Group call
      await db.ref('groupCalls/' + callId).set({
        sender: uid,
        groupName: currentChatName,
        status: 'active',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      
      // Notify group members via a special message
      sendMessage('📞 Started a group video call', true);
      
      joinGroupCall();
    }
  } catch (err) {
    showToast('Could not start call: ' + err.message);
    endCall();
  }
}

function setupPeerConnection(otherUid, otherName) {
  if (peerConnections[otherUid]) return;

  var pc = new RTCPeerConnection(rtcConfig);
  peerConnections[otherUid] = pc;

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) {
      var path = callType === 'dm' ? 'calls/' + callId : 'groupCalls/' + callId + '/signals/' + uid + '/' + otherUid;
      db.ref(path + '/candidates/' + uid).push(e.candidate.toJSON());
    }
  };

  pc.ontrack = e => {
    addRemoteVideo(otherUid, otherName, e.streams[0]);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      removeRemoteVideo(otherUid);
    }
  };
}

function addRemoteVideo(otherUid, name, stream) {
  if (document.getElementById('video-' + otherUid)) return;
  
  var container = document.createElement('div');
  container.id = 'video-' + otherUid;
  container.className = 'remote-video-container';
  
  var video = document.createElement('video');
  video.className = 'remote-video';
  video.autoplay = true;
  video.playsinline = true;
  video.srcObject = stream;
  
  var nameTag = document.createElement('div');
  nameTag.className = 'remote-name';
  nameTag.innerHTML = name + ' <span class="mute-status" style="display:none">🔇</span>';
  
  container.appendChild(video);
  container.appendChild(nameTag);
  document.getElementById('videoGrid').appendChild(container);
}

function removeRemoteVideo(otherUid) {
  var el = document.getElementById('video-' + otherUid);
  if (el) el.remove();
  if (peerConnections[otherUid]) {
    peerConnections[otherUid].close();
    delete peerConnections[otherUid];
  }
}

function listenToCallSignals(cId, otherUid) {
  var path = callType === 'dm' ? 'calls/' + cId : 'groupCalls/' + cId + '/signals/' + otherUid + '/' + uid;
  
  // Listen for answer
  db.ref(path + '/answer').on('value', async snap => {
    if (snap.exists() && isCallActive && peerConnections[otherUid]) {
      await peerConnections[otherUid].setRemoteDescription(new RTCSessionDescription(snap.val()));
    }
  });

  // Listen for ICE candidates
  db.ref(path + '/candidates/' + otherUid).on('child_added', snap => {
    if (isCallActive && peerConnections[otherUid]) {
      peerConnections[otherUid].addIceCandidate(new RTCIceCandidate(snap.val()));
    }
  });

  // Listen for hangup
  db.ref('calls/' + cId + '/status').on('value', snap => {
    if (snap.val() === 'ended' || snap.val() === 'rejected') endCall(false);
  });

  // Listen for mute
  db.ref('calls/' + cId + '/muted/' + otherUid).on('value', snap => {
    var isMuted = snap.val();
    var el = document.querySelector('#video-' + otherUid + ' .mute-status');
    if (el) el.style.display = isMuted ? 'inline' : 'none';
  });
}

async function acceptCall() {
  document.getElementById('incomingCallModal').classList.remove('open');
  if (isCallActive) endCall();
  
  document.getElementById('videoCallOverlay').classList.add('open');
  document.getElementById('videoGrid').innerHTML = '';
  isCallActive = true;
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
    
    if (callType === 'dm') {
      var snap = await db.ref('calls/' + callId).once('value');
      var call = snap.val();
      var otherUid = call.sender;
      
      setupPeerConnection(otherUid, call.senderName || 'User');
      var pc = peerConnections[otherUid];
      
      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      await db.ref('calls/' + callId).update({
        status: 'active',
        answer: { type: answer.type, sdp: answer.sdp },
        [`muted/${uid}`]: false
      });
      
      listenToCallSignals(callId, otherUid);
    } else {
      joinGroupCall();
    }
  } catch (err) {
    showToast('Could not accept call: ' + err.message);
    endCall();
  }
}

async function joinGroupCall() {
  // 1. Add myself to participants
  db.ref('groupCalls/' + callId + '/participants/' + uid).set({
    name: myUsername,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
    muted: false
  });

  // 2. Listen for other participants
  db.ref('groupCalls/' + callId + '/participants').on('child_added', async snap => {
    var otherUid = snap.key;
    if (otherUid === uid) return;

    // To avoid race conditions where both try to offer, 
    // we use a simple rule: the user with the "smaller" UID sends the offer.
    if (uid < otherUid) {
      setupPeerConnection(otherUid, snap.val().name || 'User');
      var pc = peerConnections[otherUid];
      var offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      db.ref('groupCalls/' + callId + '/signals/' + uid + '/' + otherUid + '/offer').set({
        type: offer.type,
        sdp: offer.sdp
      });
      listenToGroupSignals(otherUid);
    }
  });

  // 3. Listen for incoming offers (where I am the receiver)
  db.ref('groupCalls/' + callId + '/signals').on('child_added', snap => {
    var senderUid = snap.key;
    if (senderUid === uid) return;
    handleIncomingGroupSignals(senderUid);
  });

  // Also check existing signals in case they were added before we started listening
  db.ref('groupCalls/' + callId + '/signals').once('value').then(snap => {
    snap.forEach(child => {
      var senderUid = child.key;
      if (senderUid !== uid) handleIncomingGroupSignals(senderUid);
    });
  });

  // 4. Listen for participants leaving
  db.ref('groupCalls/' + callId + '/participants').on('child_removed', snap => {
    var leavingUid = snap.key;
    if (peerConnections[leavingUid]) {
      peerConnections[leavingUid].close();
      delete peerConnections[leavingUid];
      removeRemoteVideo(leavingUid);
    }
  });
}

async function handleIncomingGroupSignals(senderUid) {
  db.ref('groupCalls/' + callId + '/signals/' + senderUid + '/' + uid + '/offer').on('value', async oSnap => {
    if (!oSnap.exists()) return;
    
    var otherName = 'User';
    var pSnap = await db.ref('groupCalls/' + callId + '/participants/' + senderUid).once('value');
    if (pSnap.exists()) otherName = pSnap.val().name;

    setupPeerConnection(senderUid, otherName);
    var pc = peerConnections[senderUid];
    
    if (pc.signalingState !== 'stable' || oSnap.val().sdp !== (pc.remoteDescription && pc.remoteDescription.sdp)) {
      await pc.setRemoteDescription(new RTCSessionDescription(oSnap.val()));
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      db.ref('groupCalls/' + callId + '/signals/' + uid + '/' + senderUid + '/answer').set({
        type: answer.type,
        sdp: answer.sdp
      });
      listenToGroupSignals(senderUid);
    }
  });
}

function listenToGroupSignals(otherUid) {
  var pc = peerConnections[otherUid];

  // Listen for answer (if I was the one who sent the offer)
  db.ref('groupCalls/' + callId + '/signals/' + otherUid + '/' + uid + '/answer').on('value', async snap => {
    if (snap.exists() && isCallActive && peerConnections[otherUid]) {
      var pc = peerConnections[otherUid];
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
      }
    }
  });
  
  // ICE Candidates from them to me (the sender of candidates)
  db.ref('groupCalls/' + callId + '/signals/' + otherUid + '/' + uid + '/candidates/' + otherUid).on('child_added', snap => {
    if (isCallActive && peerConnections[otherUid]) {
      peerConnections[otherUid].addIceCandidate(new RTCIceCandidate(snap.val()));
    }
  });

  // Also listen for candidates from them if they are the "receiver" in the signal path
  db.ref('groupCalls/' + callId + '/signals/' + uid + '/' + otherUid + '/candidates/' + otherUid).on('child_added', snap => {
    if (isCallActive && peerConnections[otherUid]) {
      peerConnections[otherUid].addIceCandidate(new RTCIceCandidate(snap.val()));
    }
  });

  // Mute status
  db.ref('groupCalls/' + callId + '/participants/' + otherUid + '/muted').on('value', snap => {
    var isMuted = snap.val();
    var el = document.querySelector('#video-' + otherUid + ' .mute-status');
    if (el) el.style.display = isMuted ? 'inline' : 'none';
  });
}

function rejectCall() {
  if (callId) {
    db.ref('calls/' + callId).update({ status: 'rejected' });
    document.getElementById('incomingCallModal').classList.remove('open');
  }
}

function endCall(notify = true) {
  isCallActive = false;
  var cId = callId;
  var cType = callType;

  if (cId) {
    db.ref('calls/' + cId).off();
    db.ref('groupCalls/' + cId + '/participants').off();
    db.ref('groupCalls/' + cId + '/signals').off();
    for (var pid in peerConnections) {
      db.ref('groupCalls/' + cId + '/signals/' + pid + '/' + uid + '/offer').off();
      db.ref('groupCalls/' + cId + '/signals/' + pid + '/' + uid + '/answer').off();
      db.ref('groupCalls/' + cId + '/signals/' + pid + '/' + uid + '/candidates/' + pid).off();
    }
  }

  if (notify && cId) {
    if (cType === 'dm') {
      db.ref('calls/' + cId).update({ status: 'ended' });
    } else {
      db.ref('groupCalls/' + cId + '/participants/' + uid).remove();
      db.ref('groupCalls/' + cId + '/signals/' + uid).remove();
      // If last participant, remove the call
      db.ref('groupCalls/' + cId + '/participants').once('value').then(snap => {
        if (!snap.exists()) db.ref('groupCalls/' + cId).remove();
      });
    }
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  for (var id in peerConnections) {
    peerConnections[id].close();
  }
  peerConnections = {};
  
  document.getElementById('videoCallOverlay').classList.remove('open');
  document.getElementById('videoGrid').innerHTML = '';
  document.getElementById('localVideo').srcObject = null;
  
  if (cType === 'dm' && cId) {
    setTimeout(() => db.ref('calls/' + cId).remove(), 2000);
  }
  callId = null;
}

function toggleMute() {
  if (localStream && callId) {
    var audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('muteBtn').textContent = audioTrack.enabled ? '🎤' : '🔇';
    
    var path = callType === 'dm' ? 'calls/' + callId + '/muted/' + uid : 'groupCalls/' + callId + '/participants/' + uid + '/muted';
    db.ref(path).set(!audioTrack.enabled);
  }
}

function toggleVideo() {
  if (localStream) {
    var videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById('videoBtn').textContent = videoTrack.enabled ? '📹' : '🚫';
  }
}

function setupPresence() {
  var presenceRef = db.ref('presence/' + uid);
  presenceRef.set(true);
  presenceRef.onDisconnect().remove();
  db.ref('.info/connected').on('value', function(snap) {
    if (snap.val()) {
      presenceRef.onDisconnect().remove();
      presenceRef.set(true);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────────────

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title, options) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

function playNotificationSound() {
  try {
    var audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var oscillator = audioContext.createOscillator();
    var gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    console.log('Could not play notification sound:', e);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// USERNAME DISPLAY
// ──────────────────────────────────────────────────────────────────────────────

function updateUsernameDisplay() {
  var display = document.getElementById('usernameDisplay');
  if (myUsername) {
    display.textContent = '@' + myUsername;
  } else {
    display.textContent = '@loading';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ──────────────────────────────────────────────────────────────────────────────


function loadContacts() {
  db.ref('contacts/' + uid).on('value', function(snap) {
    var list = document.getElementById('contactList');
    if (!snap.exists()) {
      list.innerHTML = '';
      return;
    }
    
    var contacts = [];
    var processedCount = 0;
    var totalContacts = snap.numChildren();

    snap.forEach(function(child) {
      var otherUid = child.key;
      var data = child.val();
      var cId = chatId(uid, otherUid);
      
      // Get last message to sort by time
      db.ref('messages/' + cId).limitToLast(1).once('value').then(function(mSnap) {
        var lastTime = 0;
        if (mSnap.exists()) {
          mSnap.forEach(function(m) { lastTime = m.val().time || 0; });
        }
        
        contacts.push({
          uid: otherUid,
          name: data.name || '?',
          lastTime: lastTime
        });
        
        processedCount++;
        if (processedCount === totalContacts) {
          renderSortedContacts(contacts);
        }
      });
    });
  });
}

function renderSortedContacts(contacts) {
  // Sort by lastTime descending
  contacts.sort(function(a, b) { return b.lastTime - a.lastTime; });
  
  var list = document.getElementById('contactList');
  list.innerHTML = '';
  
  contacts.forEach(function(data) {
    var otherUid = data.uid;
    var name = data.name;
    var item = document.createElement('div');
    item.className = 'contact-item' + (currentChatUid === otherUid && currentChatType === 'dm' ? ' active' : '');
    item.id = 'contact-' + otherUid;
    item.innerHTML =
      '<div class="avatar">' + escapeHtml(name[0].toUpperCase()) + '</div>' +
      '<div class="contact-info">' +
        '<div class="contact-name">@' + escapeHtml(name) + '</div>' +
        '<div class="contact-code" id="unread-' + otherUid + '"></div>' +
      '</div>' +
      '<div class="status-dot" id="dot-' + otherUid + '"></div>';
    
    watchUnread('messages/' + chatId(uid, otherUid), 'unread-' + otherUid);
    item.onclick = function() { openDM(otherUid, name); };
    list.appendChild(item);
    watchPresence(otherUid);
  });
}

function watchPresence(id) {
  db.ref('presence/' + id).on('value', function(snap) {
    var dot = document.getElementById('dot-' + id);
    if (dot) dot.className = 'status-dot' + (snap.exists() ? ' online' : '');
  });
}

function watchUnread(path, elementId) {
  db.ref(path).limitToLast(1).on('value', function(snap) {
    var lastMsg = null;
    var unreadCount = 0;
    
    // We need to check all messages for unread count, but limitToLast(1) only gives the last one.
    // So we'll use a separate listener for the count if needed, or just fetch all for now since it's simple.
    db.ref(path).once('value').then(function(fullSnap) {
      fullSnap.forEach(function(child) {
        var msg = child.val();
        if (msg.sender !== uid && !msg.seen) unreadCount++;
        lastMsg = msg;
      });

      var el = document.getElementById(elementId);
      if (!el) return;

      if (unreadCount > 0) {
        el.textContent = unreadCount + ' new message' + (unreadCount > 1 ? 's' : '');
        el.style.color = 'var(--primary-light)';
        el.style.fontWeight = 'bold';
      } else if (lastMsg && lastMsg.sender === uid) {
        if (lastMsg.opened) {
          el.textContent = 'Opened 👁';
          el.style.color = 'var(--text-muted-dark)';
        } else if (lastMsg.delivered) {
          el.textContent = 'Delivered ✓';
          el.style.color = 'var(--text-muted-dark)';
        } else {
          el.textContent = 'Sent ✓';
          el.style.color = 'var(--text-muted-dark)';
        }
        el.style.fontWeight = 'normal';
      } else {
        // Reset to default or member count if it's a group
        if (elementId.startsWith('unread-group-')) {
          db.ref('groups/' + elementId.replace('unread-group-', '')).once('value').then(function(gSnap) {
            if (gSnap.exists()) {
              var mc = gSnap.val().memberCount || 0;
              el.textContent = mc + ' member' + (mc !== 1 ? 's' : '');
              el.style.color = 'var(--text-muted-dark)';
              el.style.fontWeight = 'normal';
            }
          });
        } else {
          el.textContent = '';
        }
      }
    });
  });
}

var allPotentialContacts = [];

function openAddContactModal() {
  document.getElementById('addUsernameInput').value = '';
  document.getElementById('addContactError').style.display = 'none';
  document.getElementById('suggestionsList').innerHTML = '<div class="loading-spinner">Searching for accounts...</div>';
  document.getElementById('suggestionsCount').textContent = 'Loading people...';
  openModal('addContactModal');
  loadPotentialContacts();
}

async function loadPotentialContacts() {
  try {
    // Get my current contacts to exclude them
    const myContactsSnap = await db.ref('contacts/' + uid).once('value');
    const myContactIds = new Set();
    if (myContactsSnap.exists()) {
      myContactsSnap.forEach(child => { myContactIds.add(child.key); });
    }

    // Get all users
    const usersSnap = await db.ref('users').once('value');
    const suggestions = [];
    
    if (usersSnap.exists()) {
      const usersData = usersSnap.val();
      const userIds = Object.keys(usersData);
      
      for (const otherUid of userIds) {
        if (otherUid === uid || myContactIds.has(otherUid)) continue;
        
        const otherUser = usersData[otherUid];
        
        // Calculate mutual friends
        const otherContactsSnap = await db.ref('contacts/' + otherUid).once('value');
        let mutualCount = 0;
        if (otherContactsSnap.exists()) {
          otherContactsSnap.forEach(child => {
            if (myContactIds.has(child.key)) mutualCount++;
          });
        }
        
        suggestions.push({
          uid: otherUid,
          username: otherUser.username || 'Unknown',
          mutualCount: mutualCount
        });
      }
    }
    
    // Sort by mutual friends descending
    suggestions.sort((a, b) => b.mutualCount - a.mutualCount);
    allPotentialContacts = suggestions;
    renderSuggestions(suggestions);
    
  } catch (error) {
    console.error("Error loading suggestions:", error);
    document.getElementById('suggestionsList').innerHTML = '<div class="loading-spinner" style="color:var(--danger)">Failed to load accounts</div>';
  }
}

function renderSuggestions(suggestions) {
  const list = document.getElementById('suggestionsList');
  const countEl = document.getElementById('suggestionsCount');
  list.innerHTML = '';
  
  if (suggestions.length === 0) {
    list.innerHTML = '<div class="loading-spinner">No accounts found</div>';
    countEl.textContent = '0 accounts';
    return;
  }
  
  countEl.textContent = suggestions.length + ' account' + (suggestions.length === 1 ? '' : 's');
  
  suggestions.forEach(person => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `
      <div class="suggestion-user">
        <div class="suggestion-avatar">${escapeHtml(person.username[0].toUpperCase())}</div>
        <div class="suggestion-info">
          <div class="suggestion-name">@${escapeHtml(person.username)}</div>
          <div class="suggestion-mutual">${person.mutualCount} mutual friend${person.mutualCount === 1 ? '' : 's'}</div>
        </div>
      </div>
      <button class="suggestion-add-btn" onclick="addContactById('${person.uid}', '${escapeHtml(person.username)}')">Add</button>
    `;
    list.appendChild(item);
  });
}

function filterSuggestions() {
  const query = document.getElementById('addUsernameInput').value.trim().toLowerCase();
  if (!query) {
    renderSuggestions(allPotentialContacts);
    return;
  }
  
  const filtered = allPotentialContacts.filter(p => 
    p.username.toLowerCase().includes(query)
  );
  renderSuggestions(filtered);
}

function addContactById(otherUid, otherUsername) {
  const errEl = document.getElementById('addContactError');
  errEl.style.display = 'none';
  
  db.ref('contacts/' + uid + '/' + otherUid).set({ name: otherUsername });
  db.ref('contacts/' + otherUid + '/' + uid).set({ name: myUsername });
  
  showToast('Contact added!');
  
  // Update local lists
  allPotentialContacts = allPotentialContacts.filter(p => p.uid !== otherUid);
  filterSuggestions(); // Re-render with current search query
}

// ──────────────────────────────────────────────────────────────────────────────
// GROUPS
// ──────────────────────────────────────────────────────────────────────────────


function loadGroups() {
  db.ref('groupMembers/' + uid).on('value', function(snap) {
    var list = document.getElementById('groupList');
    if (!snap.exists()) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted-dark);font-size:13px">No groups yet. Create one!</div>';
      return;
    }
    
    var groups = [];
    var processedCount = 0;
    var totalGroups = snap.numChildren();

    snap.forEach(function(child) {
      var groupId = child.key;
      db.ref('groups/' + groupId).once('value').then(function(gSnap) {
        if (!gSnap.exists()) {
          processedCount++;
          if (processedCount === totalGroups) renderSortedGroups(groups);
          return;
        }
        var g = gSnap.val();
        
        // Get last message time for group
        db.ref('groupMessages/' + groupId).limitToLast(1).once('value').then(function(mSnap) {
          var lastTime = g.createdAt || 0;
          if (mSnap.exists()) {
            mSnap.forEach(function(m) { lastTime = m.val().time || 0; });
          }
          
          groups.push({
            id: groupId,
            name: g.name || 'Group',
            memberCount: g.memberCount || 0,
            lastTime: lastTime
          });
          
          processedCount++;
          if (processedCount === totalGroups) {
            renderSortedGroups(groups);
          }
        });
      });
    });
  });
}

function renderSortedGroups(groups) {
  // Sort by lastTime descending
  groups.sort(function(a, b) { return b.lastTime - a.lastTime; });
  
  var list = document.getElementById('groupList');
  list.innerHTML = '';
  
  if (groups.length === 0) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted-dark);font-size:13px">No groups yet. Create one!</div>';
    return;
  }

  groups.forEach(function(g) {
    var item = document.createElement('div');
    item.className = 'group-item' + (currentChat === g.id && currentChatType === 'group' ? ' active' : '');
    item.id = 'group-' + g.id;
    item.innerHTML =
      '<div class="avatar">' + escapeHtml(g.name[0].toUpperCase()) + '</div>' +
      '<div class="contact-info">' +
        '<div class="contact-name">' + escapeHtml(g.name) + '</div>' +
        '<div class="contact-code" id="unread-group-' + g.id + '">' + g.memberCount + ' member' + (g.memberCount !== 1 ? 's' : '') + '</div>' +
      '</div>';
    
    item.onclick = function() { openGroup(g.id, g.name); };
    list.appendChild(item);
    watchUnread('groupMessages/' + g.id, 'unread-group-' + g.id);
  });
}

function openCreateGroupModal() {
  document.getElementById('groupNameInput').value = '';
  openModal('createGroupModal');
}

function createGroup() {
  var name = document.getElementById('groupNameInput').value.trim();
  if (!name) return;
  var groupRef = db.ref('groups').push();
  var groupId = groupRef.key;
  groupRef.set({ name: name, createdBy: uid, createdAt: Date.now(), memberCount: 1 });
  db.ref('groupMembers/' + uid + '/' + groupId).set(true);
  closeModal('createGroupModal');
  showToast('Group created!');
  openGroup(groupId, name);
}

function openGroupSettings() {
  if (!currentGroupId) return;
  db.ref('groups/' + currentGroupId).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var g = snap.val();
    if (g.createdBy !== uid) {
      showToast('Only the group owner can change settings');
      return;
    }
    document.getElementById('groupNameEdit').value = g.name || '';
    loadGroupMembers();
    document.getElementById('addMemberUsername').value = '';
    document.getElementById('addMemberError').style.display = 'none';
    openModal('groupSettingsModal');
  });
}

function loadGroupMembers() {
  var list = document.getElementById('memberList');
  list.innerHTML = '';
  db.ref('groupMembers').once('value').then(function(snap) {
    snap.forEach(function(userMembers) {
      var memberId = userMembers.key;
      userMembers.forEach(function(group) {
        if (group.key === currentGroupId) {
          db.ref('users/' + memberId).once('value').then(function(userSnap) {
            if (!userSnap.exists()) return;
            var userData = userSnap.val();
            var memberName = userData.username || memberId;
            var item = document.createElement('div');
            item.className = 'member-item';
            var isOwner = memberId === db.ref('groups/' + currentGroupId).once('value').then(function(s) { return s.val().createdBy; });
            var badge = '';
            db.ref('groups/' + currentGroupId).once('value').then(function(gSnap) {
              if (gSnap.val().createdBy === memberId) {
                badge = '<span class="member-badge">Owner</span>';
              }
              var removeBtn = memberId === uid
                ? '<span style="color:var(--text-muted-dark);font-size:11px">You</span>'
                : '<button class="member-remove" onclick="removeGroupMember(\'' + memberId + '\')">×</button>';
              item.innerHTML = '<div class="member-name">' + badge + '@' + escapeHtml(memberName) + '</div>' + removeBtn;
            });
            list.appendChild(item);
          });
        }
      });
    });
  });
}

function addGroupMember() {
  if (!currentGroupId) return;
  db.ref('groups/' + currentGroupId).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var g = snap.val();
    if (g.createdBy !== uid) {
      showToast('Only the group owner can add members');
      return;
    }

    var username = document.getElementById('addMemberUsername').value.trim().toLowerCase();
    var errEl = document.getElementById('addMemberError');
    errEl.style.display = 'none';

    if (!username) {
      errEl.textContent = 'Please enter a username';
      errEl.style.display = 'block';
      return;
    }

    if (username.startsWith('@')) username = username.substring(1);

    if (username === myUsername.toLowerCase()) {
      errEl.textContent = "That's your own username!";
      errEl.style.display = 'block';
      return;
    }

    db.ref('usernames/' + username).once('value').then(function(snap) {
      if (!snap.exists()) {
        errEl.textContent = 'User not found';
        errEl.style.display = 'block';
        return;
      }
      var memberId = snap.val().uid;
      db.ref('groupMembers/' + memberId + '/' + currentGroupId).once('value').then(function(memberSnap) {
        if (memberSnap.exists()) {
          errEl.textContent = 'User is already in this group';
          errEl.style.display = 'block';
          return;
        }
        db.ref('groupMembers/' + memberId + '/' + currentGroupId).set(true);
        db.ref('groups/' + currentGroupId + '/memberCount').transaction(function(current) {
          return (current || 0) + 1;
        });
        document.getElementById('addMemberUsername').value = '';
        showToast('Member added!');
        loadGroupMembers();
      });
    });
  });
}

function removeGroupMember(memberId) {
  if (!currentGroupId) return;
  db.ref('groups/' + currentGroupId).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var g = snap.val();
    if (g.createdBy !== uid) {
      showToast('Only the group owner can remove members');
      return;
    }
    if (!confirm('Remove this member?')) return;
    db.ref('groupMembers/' + memberId + '/' + currentGroupId).remove();
    db.ref('groups/' + currentGroupId + '/memberCount').transaction(function(current) {
      return Math.max((current || 1) - 1, 0);
    });
    showToast('Member removed');
    loadGroupMembers();
  });
}

function updateGroupName() {
  if (!currentGroupId) return;
  db.ref('groups/' + currentGroupId).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var g = snap.val();
    if (g.createdBy !== uid) {
      showToast('Only the group owner can rename the group');
      return;
    }
    var newName = document.getElementById('groupNameEdit').value.trim();
    if (!newName) {
      showToast('Group name cannot be empty');
      return;
    }
    if (newName === g.name) {
      showToast('That\'s already the group name');
      return;
    }
    db.ref('groups/' + currentGroupId + '/name').set(newName).then(function() {
      currentChatName = newName;
      document.getElementById('chatName').textContent = newName;
      closeModal('groupSettingsModal');
      showToast('Group name updated!');
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// OPEN CHAT
// ──────────────────────────────────────────────────────────────────────────────

function openDM(otherUid, name) {
  clearMessageListeners();
  currentChatUid = otherUid;
  currentChat = chatId(uid, otherUid);
  currentChatType = 'dm';
  currentGroupId = null;
  memberColors = {};

  document.querySelectorAll('.contact-item').forEach(function(el) { el.classList.remove('active'); });
  var item = document.getElementById('contact-' + otherUid);
  if (item) item.classList.add('active');

  document.getElementById('groupSettingsBtn').style.display = 'none';

  currentChatName = name;
  showChatArea(name);
  
  var headerAvatar = document.getElementById('chatHeaderAvatar');
  headerAvatar.innerHTML = name[0].toUpperCase();
  headerAvatar.style.background = 'var(--gradient)';
  headerAvatar.onclick = function() { openUserProfile(otherUid); };
  
  // Try to load user's profile image for the header
  db.ref('users/' + otherUid + '/profileImage').once('value').then(function(snap) {
    if (snap.exists() && currentChatUid === otherUid) {
      headerAvatar.innerHTML = '<img src="' + snap.val() + '" alt="Profile">';
    }
  });

  loadMessages('messages/' + currentChat, false);
  listenTyping('typing/' + currentChat);
  if (window.innerWidth <= 768) hideSidebar();
}

function openUserProfile(targetUid) {
  if (!targetUid) return;
  
  var modal = document.getElementById('userProfileModal');
  var nameEl = document.getElementById('userProfileName');
  var avatarEl = document.getElementById('userProfileAvatar');
  var statusEl = document.getElementById('userProfileStatus');
  var chatBtn = document.getElementById('userProfileChatBtn');
  
  // Set initial loading state
  nameEl.textContent = 'Loading...';
  avatarEl.innerHTML = '?';
  statusEl.textContent = 'Fetching profile details...';
  
  db.ref('users/' + targetUid).once('value').then(function(snap) {
    if (!snap.exists()) {
      showToast('User not found');
      return;
    }
    
    var data = snap.val();
    var username = data.username || 'User';
    nameEl.textContent = '@' + username;
    avatarEl.innerHTML = username[0].toUpperCase();
    statusEl.textContent = 'Member since ' + new Date(data.createdAt || Date.now()).toLocaleDateString();
    
    if (data.profileImage) {
      avatarEl.innerHTML = '<img src="' + data.profileImage + '" alt="Profile">';
    }
    
    chatBtn.onclick = function() {
      closeModal('userProfileModal');
      openDM(targetUid, username);
    };
    
    openModal('userProfileModal');
  }).catch(function(err) {
    showToast('Error: ' + err.message);
  });
}

function openGroup(groupId, name) {
  clearMessageListeners();
  currentGroupId = groupId;
  currentChat = groupId;
  currentChatType = 'group';
  currentChatUid = null;
  memberColors = {};

  document.querySelectorAll('.group-item').forEach(function(el) { el.classList.remove('active'); });
  var item = document.getElementById('group-' + groupId);
  if (item) item.classList.add('active');

  document.getElementById('groupSettingsBtn').style.display = 'flex';

  currentChatName = name;
  showChatArea(name);
  document.getElementById('chatHeaderAvatar').textContent = name[0].toUpperCase();
  document.getElementById('chatHeaderAvatar').style.background = 'var(--gradient-alt)';

  loadMessages('groupMessages/' + groupId, true);
  listenTyping('groupTyping/' + groupId);
  if (window.innerWidth <= 768) hideSidebar();
}

function showChatArea(name) {
  // Hide settings page and empty state
  document.getElementById('settingsPage').style.display = 'none';
  document.getElementById('profilePage').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  // Show chat
  document.getElementById('chatMain').style.display = 'flex';
  document.getElementById('chatName').textContent = name;
}

// ──────────────────────────────────────────────────────────────────────────────
// MESSAGES
// ──────────────────────────────────────────────────────────────────────────────

function loadMessages(path, isGroup, append = false) {
  var box = document.getElementById('messages');
  if (!append) {
    box.innerHTML = '<div id="loadMoreSpinner" style="text-align:center; padding:10px; color:var(--text-muted); font-size:12px;">Loading messages...</div>';
    messageLimit = 20;
    hasMoreMessages = true;
    firstMessageKey = null;
  }
  
  var ref = db.ref(path).limitToLast(messageLimit);
  var listener = ref.on('value', function(snap) {
    var pathParts = path.split('/');
    var chatIdFromPath = pathParts[pathParts.length - 1];
    if (currentChat !== chatIdFromPath) return;

    var currentRenderId = ++lastRenderId;
    
    // Remember scroll position
    var oldScrollHeight = box.scrollHeight;
    var oldScrollTop = box.scrollTop;
    
    box.innerHTML = '';
    
    var updates = {};
    var messagesToRender = [];
    var snapCount = 0;
    
    snap.forEach(function(child) {
      snapCount++;
      var m = child.val();
      m._key = child.key;
      messagesToRender.push(m);
      if (snapCount === 1) {
        if (firstMessageKey === m._key) {
           // No new messages at the top
        }
        firstMessageKey = m._key;
      }
      
      var msgId = chatIdFromPath + '_' + child.key;
      if (m.sender !== uid && !m.opened && !seenMessageIds.has(msgId) && userSettings.notifications) {
        var txt = m.type === 'text' ? decryptMessage(m.text || '') : '[Image]';
        var sender = m.senderName || 'Someone';
        sendNotification('New message from ' + sender, { body: txt.substring(0, 100), icon: '💬' });
        if (userSettings.sound) playNotificationSound();
      }
      seenMessageIds.add(msgId);
      
      if (m.sender !== uid && !m.opened) {
        updates[child.key + '/seen'] = true;
        updates[child.key + '/opened'] = true;
        updates[child.key + '/openedAt'] = firebase.database.ServerValue.TIMESTAMP;
      }

      // --- AUTO-DELETE EXPIRED MESSAGES ---
      // Check if message was opened more than 24 hours ago
      if (m.openedAt) {
        var twentyFourHours = 24 * 60 * 60 * 1000;
        var now = Date.now();
        if (now - m.openedAt > twentyFourHours) {
          db.ref(path + '/' + child.key).remove();
          return; // Skip rendering this message
        }
      }
    });

    // Check if we reached the end
    if (snapCount < messageLimit) hasMoreMessages = false;

    for (var i = 0; i < messagesToRender.length; i++) {
      if (currentRenderId !== lastRenderId) return;
      renderMessage(messagesToRender[i], isGroup, box);
    }
    
    // Handle scrolling
    if (!isLoadingMore) {
      box.scrollTop = box.scrollHeight;
    } else {
      // Restore scroll position after loading older messages
      box.scrollTop = box.scrollTop + (box.scrollHeight - oldScrollHeight);
      isLoadingMore = false;
    }

    if (Object.keys(updates).length > 0) {
      db.ref(path).update(updates);
    }
  });
  messageListeners.push({ ref: ref, listener: listener, event: 'value' });
}

// Add scroll listener for lazy loading
document.getElementById('messages').addEventListener('scroll', function() {
  var box = this;
  if (box.scrollTop < 50 && !isLoadingMore && hasMoreMessages && currentChat) {
    isLoadingMore = true;
    messageLimit += 20;
    var path = currentChatType === 'group' ? 'groupMessages/' + currentChat : 'messages/' + currentChat;
    
    // Re-run listener with new limit
    clearMessageListeners();
    loadMessages(path, currentChatType === 'group', true);
  }
});

function getMemberColor(memberId) {
  if (!memberColors[memberId]) {
    var colorIndex = Object.keys(memberColors).length % colorPalette.length;
    memberColors[memberId] = colorPalette[colorIndex];
  }
  return memberColors[memberId];
}

function renderMessage(m, isGroup, box) {
  var isMe = m.sender === uid;
  var div = document.createElement('div');
  div.className = 'msg-container' + (isMe ? ' me' : ' other');
  div.setAttribute('data-key', m._key);

  var senderLabel = '';
  if (isGroup && !isMe) {
    var color = getMemberColor(m.sender);
    senderLabel = '<div class="msg-sender-label" style="color:' + color + '; cursor: pointer;" onclick="openUserProfile(\'' + m.sender + '\')">@' + escapeHtml(m.senderName || m.sender || '') + '</div>';
  } else if (!isGroup && !isMe) {
    senderLabel = '<div class="msg-sender-label" style="cursor: pointer;" onclick="openUserProfile(\'' + m.sender + '\')">@' + escapeHtml(m.senderName || m.sender || '') + '</div>';
  }

  // --- REPLY RENDERING ---
  var replyHtml = '';
  if (m.replyTo) {
    replyHtml = '<div class="msg-reply-container">' +
      '<b>@' + escapeHtml(m.replyTo.senderName) + '</b>: ' +
      escapeHtml(m.replyTo.text.substring(0, 50)) + (m.replyTo.text.length > 50 ? '...' : '') +
      '</div>';
  }

  // --- CONTENT RENDERING ---
  var content = '';
  if (m.type === 'image' && m.url) {
    var decryptedUrl = decryptMessage(m.url);
    var safeUrl = decryptedUrl.replace(/"/g, '&quot;');
    content = '<img src="' + safeUrl + '" onclick="openLightbox(\'' + safeUrl + '\')" alt="Image">';
  } else if (m.type === 'voice' && m.url) {
    var audioUrl = decryptMessage(m.url);
    content = '<div class="voice-msg">' +
      '<button class="voice-play-btn" onclick="playVoice(this, \'' + audioUrl + '\')">▶</button>' +
      '<div class="voice-wave-container">' +
      Array(12).fill('<div class="voice-bar"></div>').join('') +
      '</div>' +
      '</div>';
  } else {
    var decryptedText = decryptMessage(m.text || '');
    content = escapeHtml(decryptedText);
  }

  // --- REACTIONS RENDERING ---
  var reactionsHtml = '<div class="reactions-container" id="reactions-' + m._key + '">';
  if (m.reactions) {
    Object.keys(m.reactions).forEach(function(emoji) {
      var reactors = m.reactions[emoji];
      var count = Object.keys(reactors).length;
      var hasReacted = reactors[uid] ? 'active' : '';
      reactionsHtml += '<div class="reaction-pill ' + hasReacted + '" onclick="toggleReaction(\'' + m._key + '\', \'' + emoji + '\')">' +
        emoji + ' <span>' + count + '</span>' +
        '</div>';
    });
  }
  reactionsHtml += '</div>';

  // --- ACTIONS OVERLAY ---
  var actionsOverlay = '<div class="msg-actions-overlay">' +
    '<span class="reaction-btn" onclick="toggleReaction(\'' + m._key + '\', \'❤️\')" title="Love">❤️</span>' +
    '<span class="reaction-btn" onclick="toggleReaction(\'' + m._key + '\', \'😂\')" title="Laughing">😂</span>' +
    '<span class="reaction-btn" onclick="toggleReaction(\'' + m._key + '\', \'😮\')" title="Surprised">😮</span>' +
    '<span class="reaction-btn" onclick="toggleReaction(\'' + m._key + '\', \'👍\')" title="Like">👍</span>' +
    '<span class="reaction-btn" onclick="toggleReaction(\'' + m._key + '\', \'🔥\')" title="Fire">🔥</span>' +
    '<span class="reaction-btn" onclick="toggleReaction(\'' + m._key + '\', \'😢\')" title="Sad">😢</span>' +
    '<span class="reaction-btn" onclick="openReactionPicker(\'' + m._key + '\')" title="More">➕</span>' +
    '<span class="reaction-btn" onclick="setReply(\'' + m._key + '\', \'' + (m.senderName || 'Someone') + '\', \'' + (m.type === 'text' ? decryptMessage(m.text || '') : '[' + m.type + ']') + '\')" title="Reply">↩️</span>' +
    '</div>';

  var time = m.time ? formatTime(m.time) : '';
  var deleteBtn = isMe ? '<button class="msg-delete" onclick="deleteMsg(\'' + m._key + '\')">×</button>' : '';
  var status = '';
  if (isMe) {
    if (m.opened) status = '<span title="Opened">👁</span>';
    else if (m.seen) status = '<span title="Seen">✓✓</span>';
    else if (m.delivered) status = '<span title="Delivered">✓</span>';
    else status = '<span title="Sent">✓</span>';
  }

  div.innerHTML = senderLabel +
    '<div class="message" onclick="handleMessageTap(this)" id="msg-' + m._key + '">' + actionsOverlay + replyHtml + content + deleteBtn + '</div>' +
    reactionsHtml +
    '<div class="msg-time">' + time + (status ? ' <span class="msg-status">' + status + '</span>' : '') + '</div>';
  box.appendChild(div);

  // --- SHARED APPEARANCE SYNC ---
  db.ref('users/' + m.sender + '/appearance').once('value').then(function(snap) {
    if (!snap.exists()) return;
    var app = snap.val();
    var msgEl = document.getElementById('msg-' + m._key);
    if (!msgEl) return;

    if (app.bubbleColor) {
      msgEl.style.background = app.bubbleColor;
      msgEl.style.color = getContrastColor(app.bubbleColor);
      // Ensure icons/buttons inside also inherit color
      msgEl.querySelectorAll('button, span').forEach(el => {
        if (!el.classList.contains('reaction-btn')) el.style.color = 'inherit';
      });
    }
    if (app.bubbleStyle) {
      if (app.bubbleStyle === 'rounded') msgEl.style.borderRadius = '18px';
      else if (app.bubbleStyle === 'square') msgEl.style.borderRadius = '4px';
      else if (app.bubbleStyle === 'pill') msgEl.style.borderRadius = '24px';
      
      // Keep the tail for the correct side
      if (isMe) msgEl.style.borderBottomRightRadius = '4px';
      else msgEl.style.borderBottomLeftRadius = '4px';
    }
  });
}

function getContrastColor(hexcolor) {
  // If a gradient or non-hex, default to white
  if (!hexcolor || hexcolor.startsWith('linear-gradient')) return 'white';
  
  hexcolor = hexcolor.replace("#", "");
  var r = parseInt(hexcolor.substr(0,2),16);
  var g = parseInt(hexcolor.substr(2,2),16);
  var b = parseInt(hexcolor.substr(4,2),16);
  var yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? 'black' : 'white';
}

function playVoice(btn, url) {
  var audio = new Audio(url);
  var bars = btn.parentElement.querySelectorAll('.voice-bar');
  btn.textContent = '⏸';
  
  audio.play();
  
  var interval = setInterval(function() {
    var progress = audio.currentTime / audio.duration;
    var activeCount = Math.floor(progress * bars.length);
    bars.forEach((bar, i) => {
      if (i <= activeCount) bar.classList.add('active');
      else bar.classList.remove('active');
    });
  }, 100);
  
  audio.onended = function() {
    btn.textContent = '▶';
    clearInterval(interval);
    bars.forEach(bar => bar.classList.remove('active'));
  };
}

function toggleReaction(msgKey, emoji) {
  if (!currentChat) return;
  var path = (currentChatType === 'group' ? 'groupMessages/' : 'messages/') + currentChat + '/' + msgKey + '/reactions/' + emoji + '/' + uid;
  var ref = db.ref(path);
  
  ref.once('value').then(function(snap) {
    if (snap.exists()) ref.remove();
    else ref.set(true);
  });
  
  // Close reaction picker if open
  var picker = document.querySelector('.reaction-picker');
  if (picker) picker.remove();
}

function openReactionPicker(msgKey) {
  // Close any existing picker
  var existingPicker = document.querySelector('.reaction-picker');
  if (existingPicker) {
    existingPicker.remove();
    return;
  }
  
  var emojis = ['❤️', '😂', '😮', '👍', '🔥', '😢', '😍', '🎉', '😭', '🤔', '👏', '💯', '🙏', '😎', '🤣', '✨', '😡', '😱', '🤷', '👌', '🎊', '🤝', '💪', '🙌'];
  var pickerHtml = '<div class="reaction-picker">';
  
  emojis.forEach(function(emoji) {
    pickerHtml += '<div class="reaction-picker-emoji" onclick="toggleReaction(\'' + msgKey + '\', \'' + emoji + '\'); this.parentElement.remove();" title="React with ' + emoji + '">' + emoji + '</div>';
  });
  
  pickerHtml += '</div>';
  
  // Find the message container and add picker to it
  var msgContainer = document.querySelector('[data-key="' + msgKey + '"]');
  if (msgContainer) {
    var picker = document.createElement('div');
    picker.innerHTML = pickerHtml;
    // Append picker to the .message div so it is positioned correctly
    var msgDiv = msgContainer.querySelector('.message');
    if (msgDiv) {
      msgDiv.appendChild(picker.firstChild);
    } else {
      msgContainer.appendChild(picker.firstChild);
    }
  }
}

function setReply(msgKey, senderName, text) {
  replyingTo = { key: msgKey, senderName: senderName, text: text };
  var preview = document.getElementById('replyPreview');
  var content = document.getElementById('replyPreviewContent');
  content.textContent = 'Replying to @' + senderName + ': ' + text;
  preview.classList.add('active');
  document.getElementById('msgInput').focus();
}

function cancelReply() {
  replyingTo = null;
  document.getElementById('replyPreview').classList.remove('active');
}

function handleMessageTap(el) {
  if (window.innerWidth > 768) return; // Only for mobile
  
  // Toggle the reaction overlay on tap for mobile
  var wasActive = el.classList.contains('mobile-active');
  
  // Close all other overlays first
  document.querySelectorAll('.message.mobile-active').forEach(m => m.classList.remove('mobile-active'));
  
  if (!wasActive) {
    el.classList.add('mobile-active');
  }
}

// Close mobile reaction overlays when clicking elsewhere
document.addEventListener('click', function(e) {
  if (!e.target.closest('.message')) {
    document.querySelectorAll('.message.mobile-active').forEach(m => m.classList.remove('mobile-active'));
  }
}, true);

function sendMessage() {
  if (isSending) return;
  
  var input = document.getElementById('msgInput');
  var text = input.value.trim();
  if (!text || !currentChat) return;

  isSending = true;
  var path = currentChatType === 'group' ? 'groupMessages/' + currentChat : 'messages/' + currentChat;
  var msgRef = db.ref(path).push();
  
  var msgData = {
    type: 'text',
    sender: uid,
    senderName: myUsername || '?',
    text: encryptMessage(text),
    time: firebase.database.ServerValue.TIMESTAMP,
    delivered: true,
    seen: false,
    opened: false
  };

  if (replyingTo) {
    msgData.replyTo = replyingTo;
    cancelReply();
  }
  
  msgRef.set(msgData).then(function() {
    isSending = false;
    sendNotification('Message sent', { body: text.substring(0, 50) });
  }).catch(function(err) {
    isSending = false;
    console.error("Error sending message:", err);
  });
  
  input.value = '';
  input.style.height = 'auto';
  clearTyping();
}

function sendImage(event) {
  var file = event.target.files[0];
  if (!file || !currentChat) return;
  event.target.value = '';

  var progress = document.getElementById('uploadProgress');
  progress.style.display = 'block';

  if (file.size > 1 * 1024 * 1024) {
    progress.textContent = 'Compressing image...';
    compressImage(file, 1024 * 1024, function(compressedBase64) {
      uploadImageData(compressedBase64);
    });
  } else {
    progress.textContent = 'Processing image...';
    var reader = new FileReader();
    reader.onload = function(e) {
      uploadImageData(e.target.result);
    };
    reader.readAsDataURL(file);
  }
}

function compressImage(file, maxSize, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var width = img.width;
      var height = img.height;

      // Initial scaling if image is huge
      var maxDimension = 1200;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height *= maxDimension / width;
          width = maxDimension;
        } else {
          width *= maxDimension / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Iterative compression
      var quality = 0.8;
      var base64 = canvas.toDataURL('image/jpeg', quality);
      
      // If still too large, keep reducing quality
      while (base64.length > maxSize * 1.3 && quality > 0.1) {
        quality -= 0.1;
        base64 = canvas.toDataURL('image/jpeg', quality);
      }
      
      callback(base64);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function uploadImageData(base64Data) {
  var progress = document.getElementById('uploadProgress');
  var path = currentChatType === 'group' ? 'groupMessages/' + currentChat : 'messages/' + currentChat;
  var msgRef = db.ref(path).push();
  
  msgRef.set({
    type: 'image',
    sender: uid,
    senderName: myUsername || '?',
    url: encryptMessage(base64Data),
    time: firebase.database.ServerValue.TIMESTAMP,
    delivered: true,
    seen: false,
    opened: false
  }).then(function() {
    showToast('Image sent!');
    progress.style.display = 'none';
    sendNotification('Photo sent', { body: 'Image' });
  }).catch(function(err) {
    showToast('Failed to send: ' + err.message);
    progress.style.display = 'none';
  });
}

function deleteMsg(key) {
  if (!currentChat) return;
  var path = currentChatType === 'group'
    ? 'groupMessages/' + currentChat + '/' + key
    : 'messages/' + currentChat + '/' + key;
  db.ref(path).remove().then(function() {
    showToast('Message deleted');
  });
}

function deleteChat() {
  if (!currentChat || !confirm('Delete this entire chat?')) return;
  var path = currentChatType === 'group' ? 'groupMessages/' + currentChat : 'messages/' + currentChat;
  db.ref(path).remove().then(function() {
    showToast('Chat deleted');
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('chatMain').style.display = 'none';
  });
}

function markMessagesAsSeen(path) {
  // Logic consolidated into loadMessages for better reliability
}

// ──────────────────────────────────────────────────────────────────────────────
// TYPING
// ──────────────────────────────────────────────────────────────────────────────

function handleTyping() {
  if (!currentChat) return;
  var path = currentChatType === 'group' ? 'groupTyping/' + currentChat : 'typing/' + currentChat;
  db.ref(path + '/' + uid).set({ name: myUsername || '?', ts: Date.now() });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(clearTyping, 2000);
}

function clearTyping() {
  if (!currentChat) return;
  var path = currentChatType === 'group' ? 'groupTyping/' + currentChat : 'typing/' + currentChat;
  db.ref(path + '/' + uid).remove();
}

function listenTyping(path) {
  var ref = db.ref(path);
  var listener = ref.on('value', function(snap) {
    var names = [];
    snap.forEach(function(c) {
      if (c.key !== uid) names.push(c.val().name || 'Someone');
    });
    var el = document.getElementById('typingIndicator');
    if (names.length === 0) el.textContent = '';
    else if (names.length === 1) el.textContent = names[0] + ' is typing...';
    else el.textContent = names.slice(0, 2).join(', ') + ' are typing...';
  });
  messageListeners.push({ ref: ref, listener: listener, event: 'value' });
}

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

function chatId(a, b) { return [a, b].sort().join('_'); }

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function formatTime(ts) {
  var d = new Date(ts);
  var h = d.getHours().toString().padStart(2, '0');
  var m = d.getMinutes().toString().padStart(2, '0');
  return h + ':' + m;
}

function escapeHtml(text) {
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab' + (tab === 'dms' ? 'DMs' : 'Groups')).classList.add('active');
  document.getElementById('contactList').style.display = tab === 'dms' ? 'block' : 'none';
  document.getElementById('groupList').style.display = tab === 'groups' ? 'block' : 'none';
}

function hideSidebar() {
  document.getElementById('sidebar').classList.remove('visible');
  var backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.classList.remove('visible');
}

function showSidebar() {
  document.getElementById('sidebar').classList.add('visible');
  var backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.classList.add('visible');
}

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('visible')) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

function goBackToContacts() {
  // Close the chat and return to the contact list
  clearMessageListeners();
  currentChatUid = null;
  currentChat = null;
  currentChatType = null;
  currentGroupId = null;
  
  // Hide chat area and show empty state
  document.getElementById('chatMain').style.display = 'none';
  document.getElementById('profilePage').style.display = 'none';
  document.getElementById('settingsPage').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
  
  // Remove active state from all contacts and groups
  document.querySelectorAll('.contact-item, .group-item').forEach(function(el) {
    el.classList.remove('active');
  });
  
  // On mobile, show the sidebar with contacts
  if (window.innerWidth <= 768) {
    showSidebar();
  }
}

function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
}

function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('open');
}

function openCamera() {
  // Check if we're on a mobile device
  var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  if (isMobile) {
    // On mobile, use the standard capture="environment" input
    document.getElementById('cameraUpload').click();
  } else {
    // On desktop, open the camera modal with WebRTC
    openCameraModal();
  }
}

function openCameraModal() {
  var video = document.getElementById('cameraVideo');
  openModal('cameraModal');
  
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(function(stream) {
        cameraStream = stream;
        video.srcObject = stream;
        video.play();
      })
      .catch(function(err) {
        showToast('Error accessing camera: ' + err.message);
        closeCameraModal();
      });
  } else {
    showToast('Camera not supported on this browser');
    closeCameraModal();
  }
}

function closeCameraModal() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  closeModal('cameraModal');
}

function capturePhoto() {
  var video = document.getElementById('cameraVideo');
  var canvas = document.getElementById('cameraCanvas');
  var context = canvas.getContext('2d');
  
  // Set canvas dimensions to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw video frame to canvas
  context.save();
  context.scale(-1, 1); // Mirror back for the actual photo
  context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  context.restore();
  
  // Convert to base64
  var base64Data = canvas.toDataURL('image/jpeg', 0.8);
  
  // Send as image
  sendCapturedImage(base64Data);
  closeCameraModal();
}

function toggleVoiceRecording() {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
}

function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Voice recording not supported');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function(stream) {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = function(e) {
        audioChunks.push(e.data);
      };
      
      mediaRecorder.onstop = function() {
        var audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        var reader = new FileReader();
        reader.onload = function(e) {
          sendVoiceMessage(e.target.result);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      isRecording = true;
      document.getElementById('voiceBtn').classList.add('recording');
      showToast('Recording...');
    })
    .catch(function(err) {
      showToast('Error accessing microphone: ' + err.message);
    });
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    document.getElementById('voiceBtn').classList.remove('recording');
    showToast('Processing voice message...');
  }
}

function sendVoiceMessage(base64Data) {
  if (!currentChat) return;
  var path = currentChatType === 'group' ? 'groupMessages/' + currentChat : 'messages/' + currentChat;
  var msgRef = db.ref(path).push();
  
  var msgData = {
    type: 'voice',
    sender: uid,
    senderName: myUsername || '?',
    url: encryptMessage(base64Data),
    time: firebase.database.ServerValue.TIMESTAMP,
    delivered: true,
    seen: false,
    opened: false
  };
  
  if (replyingTo) {
    msgData.replyTo = replyingTo;
    cancelReply();
  }
  
  msgRef.set(msgData).then(function() {
    showToast('Voice message sent!');
  });
}

function sendCapturedImage(base64Data) {
  if (!currentChat) return;

  var progress = document.getElementById('uploadProgress');
  progress.textContent = 'Processing image...';
  progress.style.display = 'block';

  var path = currentChatType === 'group' ? 'groupMessages/' + currentChat : 'messages/' + currentChat;
  var msgRef = db.ref(path).push();
  
  msgRef.set({
    type: 'image',
    sender: uid,
    senderName: myUsername || '?',
    url: base64Data,
    time: firebase.database.ServerValue.TIMESTAMP,
    delivered: true,
    seen: false,
    opened: false
  }).then(function() {
    showToast('Image sent!');
    progress.style.display = 'none';
    sendNotification('Photo sent', { body: 'Image' });
  }).catch(function(err) {
    showToast('Failed to send: ' + err.message);
    progress.style.display = 'none';
  });
}

function clearMessageListeners() {
  messageListeners.forEach(function(l) {
    l.ref.off(l.event, l.listener);
  });
  messageListeners = [];
}

// Load theme preference
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target === el) el.classList.remove('open');
  });
});

// Mobile: show sidebar by default on load (so contacts are visible)
if (window.innerWidth <= 768) {
  showSidebar();
}
// ──────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────────────────────────────────────

var userSettings = {
  bubbleStyle: localStorage.getItem('bubbleStyle') || 'rounded',
  bubbleColor: localStorage.getItem('bubbleColor') || '#3b82f6',
  ghostMode: localStorage.getItem('ghostMode') === 'true',
  readReceipts: localStorage.getItem('readReceipts') !== 'false',
  notifications: localStorage.getItem('notifications') !== 'false',
  sound: localStorage.getItem('sound') !== 'false'
};

function openSettings() {
  // Clear any active chats to prevent overlapping
  clearMessageListeners();
  currentChatUid = null;
  currentChat = null;
  currentChatType = null;
  currentGroupId = null;
  
  // Remove active state from all contacts and groups
  document.querySelectorAll('.contact-item, .group-item').forEach(function(el) {
    el.classList.remove('active');
  });
  
  // Show settings page (both mobile and desktop)
  document.getElementById('chatMain').style.display = 'none';
  document.getElementById('profilePage').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('settingsPage').style.display = 'flex';
  
  var backBtn = document.getElementById('settingsBackBtn');
  
  // On mobile, hide the sidebar and show back button
  if (window.innerWidth <= 768) {
    hideSidebar();
    if (backBtn) backBtn.style.display = 'block';
  } else {
    // On desktop, hide back button
    if (backBtn) backBtn.style.display = 'none';
  }
  
  loadSettingsUI();
}

function closeSettings() {
  document.getElementById('settingsPage').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
}

function changeBubbleStyle(style) {
  userSettings.bubbleStyle = style;
  localStorage.setItem('bubbleStyle', style);
  if (uid) db.ref('users/' + uid + '/appearance/bubbleStyle').set(style);
  applyBubbleStyle();
  showToast('Bubble style changed to ' + style);
}

function changeBubbleColor(color) {
  userSettings.bubbleColor = color;
  localStorage.setItem('bubbleColor', color);
  if (uid) db.ref('users/' + uid + '/appearance/bubbleColor').set(color);
  applyBubbleColor();
  showToast('Bubble color updated');
}

function resetAppearance() {
  if (!confirm('Reset your message appearance to default?')) return;
  
  userSettings.bubbleStyle = 'rounded';
  userSettings.bubbleColor = '#3b82f6'; // Default primary
  
  localStorage.removeItem('bubbleStyle');
  localStorage.removeItem('bubbleColor');
  
  if (uid) {
    db.ref('users/' + uid + '/appearance').remove();
  }
  
  // Update UI
  var styleSelect = document.getElementById('bubbleStyleSelect');
  var colorInput = document.getElementById('bubbleColorInput');
  if (styleSelect) styleSelect.value = 'rounded';
  if (colorInput) colorInput.value = '#3b82f6';
  
  // Remove custom styles
  var customStyle = document.getElementById('customBubbleStyle');
  if (customStyle) customStyle.remove();
  
  applyBubbleStyle();
  showToast('Appearance reset to default');
}

function applyBubbleStyle() {
  var style = userSettings.bubbleStyle;
  var messages = document.querySelectorAll('.message');
  messages.forEach(function(msg) {
    if (style === 'rounded') {
      msg.style.borderRadius = '18px';
    } else if (style === 'square') {
      msg.style.borderRadius = '4px';
    } else if (style === 'pill') {
      msg.style.borderRadius = '24px';
    }
  });
}

function applyBubbleColor() {
  var color = userSettings.bubbleColor;
  var style = document.getElementById('customBubbleStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'customBubbleStyle';
    document.head.appendChild(style);
  }
  style.textContent = '.msg-container.me .message { background: ' + color + ' !important; color: ' + getContrastColor(color) + ' !important; }';
}

function toggleGhostMode() {
  userSettings.ghostMode = document.getElementById('ghostModeToggle').checked;
  localStorage.setItem('ghostMode', userSettings.ghostMode);
  if (userSettings.ghostMode) {
    db.ref('presence/' + uid).remove();
    showToast('Ghost Mode enabled - your status is hidden');
  } else {
    db.ref('presence/' + uid).set(true);
    showToast('Ghost Mode disabled');
  }
}

function toggleReadReceipts() {
  userSettings.readReceipts = document.getElementById('readReceiptsToggle').checked;
  localStorage.setItem('readReceipts', userSettings.readReceipts);
  showToast('Read receipts ' + (userSettings.readReceipts ? 'enabled' : 'disabled'));
}

function toggleNotifications() {
  var mobile = document.getElementById('notificationsToggle');
  var desktop = document.getElementById('notificationsToggleModal');
  var checked = mobile ? mobile.checked : (desktop ? desktop.checked : true);
  userSettings.notifications = checked;
  localStorage.setItem('notifications', userSettings.notifications);
  if (mobile) mobile.checked = checked;
  if (desktop) desktop.checked = checked;
  showToast('Notifications ' + (userSettings.notifications ? 'enabled' : 'disabled'));
}

function toggleSound() {
  var mobile = document.getElementById('soundToggle');
  var desktop = document.getElementById('soundToggleModal');
  var checked = mobile ? mobile.checked : (desktop ? desktop.checked : true);
  userSettings.sound = checked;
  localStorage.setItem('sound', userSettings.sound);
  if (mobile) mobile.checked = checked;
  if (desktop) desktop.checked = checked;
  showToast('Sound ' + (userSettings.sound ? 'enabled' : 'disabled'));
}

function clearCache() {
  if (confirm('Clear all cached data? This will remove locally stored settings.')) {
    localStorage.clear();
    showToast('Cache cleared');
    location.reload();
  }
}

function loadSettingsUI() {
  // Load saved settings into UI (mobile)
  var bubbleSelect = document.getElementById('bubbleStyleSelect');
  var bubbleColor = document.getElementById('bubbleColorInput');
  var ghostToggle = document.getElementById('ghostModeToggle');
  var readToggle = document.getElementById('readReceiptsToggle');
  var notifToggle = document.getElementById('notificationsToggle');
  var soundToggle = document.getElementById('soundToggle');
  
  if (bubbleSelect) bubbleSelect.value = userSettings.bubbleStyle;
  if (bubbleColor) bubbleColor.value = userSettings.bubbleColor;
  if (ghostToggle) ghostToggle.checked = userSettings.ghostMode;
  if (readToggle) readToggle.checked = userSettings.readReceipts;
  if (notifToggle) notifToggle.checked = userSettings.notifications;
  if (soundToggle) soundToggle.checked = userSettings.sound;
  
  // Load saved settings into UI (desktop modal)
  var bubbleSelectModal = document.getElementById('bubbleStyleSelectModal');
  var bubbleColorModal = document.getElementById('bubbleColorInputModal');
  var ghostToggleModal = document.getElementById('ghostModeToggleModal');
  var readToggleModal = document.getElementById('readReceiptsToggleModal');
  var notifToggleModal = document.getElementById('notificationsToggleModal');
  var soundToggleModal = document.getElementById('soundToggleModal');
  
  if (bubbleSelectModal) bubbleSelectModal.value = userSettings.bubbleStyle;
  if (bubbleColorModal) bubbleColorModal.value = userSettings.bubbleColor;
  if (ghostToggleModal) ghostToggleModal.checked = userSettings.ghostMode;
  if (readToggleModal) readToggleModal.checked = userSettings.readReceipts;
  if (notifToggleModal) notifToggleModal.checked = userSettings.notifications;
  if (soundToggleModal) soundToggleModal.checked = userSettings.sound;
  
  // Apply bubble customizations
  applyBubbleStyle();
  applyBubbleColor();
}

// Add back button to Settings page on mobile
setTimeout(function() {
  var settingsPage = document.getElementById('settingsPage');
  if (settingsPage && window.innerWidth <= 768) {
    var backBtn = document.createElement('button');
    backBtn.textContent = '← Back';
    backBtn.style.cssText = 'position:absolute; top:16px; left:16px; background:none; border:none; color:var(--primary); font-size:16px; font-weight:600; cursor:pointer; padding:8px; z-index:10;';
    backBtn.onclick = function() {
      document.getElementById('settingsPage').style.display = 'none';
      document.getElementById('emptyState').style.display = 'flex';
      showSidebar();
    };
    if (!settingsPage.querySelector('button[style*="position:absolute"]')) {
      settingsPage.style.position = 'relative';
      settingsPage.insertBefore(backBtn, settingsPage.firstChild);
	    }
	  }
	}, 100);

// ──────────────────────────────────────────────────────────────────────────────
// PROFILE PAGE
// ──────────────────────────────────────────────────────────────────────────────

function openProfile() {
  // Clear any active chats
  clearMessageListeners();
  currentChatUid = null;
  currentChat = null;
  currentChatType = null;
  currentGroupId = null;
  
  // Remove active state from all contacts and groups
  document.querySelectorAll('.contact-item, .group-item').forEach(function(el) {
    el.classList.remove('active');
  });
  
  // Hide other pages
  document.getElementById('chatMain').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('settingsPage').style.display = 'none';
  
  // Show profile page
  document.getElementById('profilePage').style.display = 'flex';
  
  // Load profile data
  loadProfileData();
  
  if (window.innerWidth <= 768) hideSidebar();
}

function loadProfileData() {
  if (!uid) return;
  
  // Update username
  var profileUsername = document.getElementById('profileUsername');
  if (profileUsername) {
    profileUsername.textContent = '@' + (myUsername || 'User');
  }
  
  var avatarEl = document.getElementById('profileAvatarDisplay');
  if (!avatarEl) return;
  
  // Set initial avatar with first letter
  var firstLetter = (myUsername || 'U')[0].toUpperCase();
  avatarEl.textContent = firstLetter;
  avatarEl.style.display = 'flex';
  avatarEl.style.alignItems = 'center';
  avatarEl.style.justifyContent = 'center';
  
  // Load profile image from database
  db.ref('users/' + uid + '/profileImage').once('value').then(function(snap) {
    if (snap.exists() && avatarEl) {
      var profileImage = snap.val();
      
      // Clear text content and show image
      avatarEl.textContent = '';
      avatarEl.innerHTML = '<img src="' + profileImage + '" alt="Profile" style="width:100%; height:100%; border-radius:12px; object-fit:cover;">';
    }
  }).catch(function(err) {
    console.error('Error loading profile image:', err);
  });
}

function uploadProfileImage(event) {
  var file = event.target.files[0];
  if (!file || !uid) return;
  event.target.value = '';
  
  // Validate file is an image
  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file');
    return;
  }
  
  var progress = document.getElementById('uploadProgress');
  if (!progress) {
    progress = document.createElement('div');
    progress.id = 'uploadProgress';
    document.body.appendChild(progress);
  }
  
  progress.style.display = 'block';
  progress.textContent = 'Uploading profile photo...';
  progress.style.position = 'fixed';
  progress.style.top = '20px';
  progress.style.right = '20px';
  progress.style.background = 'var(--primary)';
  progress.style.color = 'white';
  progress.style.padding = '12px 16px';
  progress.style.borderRadius = '8px';
  progress.style.zIndex = '9999';
  
  if (file.size > 2 * 1024 * 1024) {
    progress.textContent = 'Compressing image...';
    compressImage(file, 2 * 1024 * 1024, function(compressedBase64) {
      saveProfileImage(compressedBase64);
    });
  } else {
    progress.textContent = 'Processing image...';
    var reader = new FileReader();
    reader.onload = function(e) {
      saveProfileImage(e.target.result);
    };
    reader.onerror = function() {
      showToast('Failed to read file');
      progress.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
}

function saveProfileImage(base64Data) {
  var progress = document.getElementById('uploadProgress');
  
  if (!base64Data || base64Data.length === 0) {
    showToast('Invalid image data');
    if (progress) progress.style.display = 'none';
    return;
  }
  
  db.ref('users/' + uid + '/profileImage').set(base64Data).then(function() {
    showToast('Profile photo updated!');
    if (progress) progress.style.display = 'none';
    
    // Update profile display
    loadProfileData();
    
    // Update sidebar avatar
    initializeProfileAvatar();
  }).catch(function(err) {
    showToast('Failed to upload: ' + err.message);
    if (progress) progress.style.display = 'none';
    console.error('Profile image save error:', err);
  });
}