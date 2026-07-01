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

// Stripe Config
var stripePriceId = 'price_1To7gwGW79t0aQmm99yyxgba';
var isPro = false;
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
    setupGlobalMessageListener();
    
    // Listen for Pro status
    db.ref('users/' + uid + '/isPro').on('value', function(proSnap) {
      isPro = proSnap.val() === true;
      updateProUI();
    });
  });
}

function updateProUI() {
  var proBadge = document.getElementById('proBadge');
  var upgradeBtn = document.getElementById('upgradeToProBtn');
  var manageBtn = document.getElementById('manageProBtn');
  var sidebarBadge = document.getElementById('sidebarProBadge');
  
  if (isPro) {
    if (proBadge) proBadge.style.display = 'block';
    if (upgradeBtn) upgradeBtn.style.display = 'none';
    if (manageBtn) manageBtn.style.display = 'block';
    
    // Add Pro badge to sidebar if it doesn't exist
    if (!sidebarBadge) {
      var nameDisplay = document.getElementById('usernameDisplay');
      if (nameDisplay) {
        sidebarBadge = document.createElement('span');
        sidebarBadge.id = 'sidebarProBadge';
        sidebarBadge.textContent = 'PRO';
        sidebarBadge.style.cssText = 'background:var(--primary); color:white; font-size:9px; font-weight:800; padding:2px 6px; border-radius:10px; margin-left:6px; vertical-align:middle;';
        nameDisplay.appendChild(sidebarBadge);
      }
    }
  } else {
    if (proBadge) proBadge.style.display = 'none';
    if (upgradeBtn) upgradeBtn.style.display = 'block';
    if (manageBtn) manageBtn.style.display = 'none';
    if (sidebarBadge) sidebarBadge.remove();
  }
}

function upgradeToPro() {
  // Pass the current user's UID to Stripe so the webhook knows who paid
  var paymentUrl = 'https://buy.stripe.com/fZu14n1PeeAb6m29dL0Fi04?client_reference_id=' + uid;
  // Open in new tab
  window.open(paymentUrl, '_blank');
  showToast('Opening secure checkout...');
}

function manageSubscription() {
  // Since we don't have a backend to create a portal session, 
  // we redirect to the Stripe customer portal if available or show a message.
  showToast('Please contact support or check your email to manage your subscription.');
}

function setupGlobalMessageListener() {
  // Listen for all messages sent to any DM I am part of
  // Note: Since Firebase is structured as messages/chatId/msgId, 
  // we listen to the parent and filter. In a real app, you'd use Cloud Functions.
  // For this app, we'll listen to contacts and then listen to their respective chat paths.
  
  db.ref('contacts/' + uid).on('child_added', function(snap) {
    var otherUid = snap.key;
    var chatPath = 'messages/' + chatId(uid, otherUid);
    
    // Listen for new messages in this chat
    // We only care about messages added AFTER the app started
    var startTime = Date.now();
    
    db.ref(chatPath).orderByChild('time').startAt(startTime).on('child_added', function(msgSnap) {
      var m = msgSnap.val();
      if (m.sender !== uid && !m.seen) {
        // Only notify if we aren't currently looking at this chat
        if (currentChat !== chatId(uid, otherUid)) {
          handleIncomingNotification(m, 'dm');
        }
      }
    });
  });
  
  // Also listen for Group messages
  db.ref('groupMembers/' + uid).on('child_added', function(snap) {
    var groupId = snap.key;
    var chatPath = 'groupMessages/' + groupId;
    var startTime = Date.now();
    
    db.ref(chatPath).orderByChild('time').startAt(startTime).on('child_added', function(msgSnap) {
      var m = msgSnap.val();
      if (m.sender !== uid && !m.seen) {
        if (currentChat !== groupId) {
          handleIncomingNotification(m, 'group', groupId);
        }
      }
    });
  });
}

function handleIncomingNotification(m, type, groupId = null) {
  if (!userSettings.notifications) return;
  
  var title = 'New message from ' + (m.senderName || 'Someone');
  if (type === 'group' && groupId) {
    // Try to get group name
    db.ref('groups/' + groupId + '/name').once('value').then(function(snap) {
      var groupName = snap.val() || 'Group';
      title = groupName + ': ' + (m.senderName || 'Someone');
      triggerNotification(title, m);
    });
  } else {
    triggerNotification(title, m);
  }
}

function triggerNotification(title, m) {
  var body = m.type === 'text' ? decryptMessage(m.text || '') : '[Image]';
  sendNotification(title, { 
    body: body.substring(0, 100), 
    icon: 'uchat-logo.png',
    tag: m.sender // Group notifications from same person or chat
  });
  if (userSettings.sound) playNotificationSound();
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
  var subtext = document.getElementById('usernameSubtext');
  
  if (!myUsername) {
    display.textContent = '@loading';
    return;
  }
  
  db.ref('users/' + uid + '/displayName').once('value').then(function(snap) {
    if (snap.exists()) {
      display.textContent = snap.val();
      if (subtext) subtext.textContent = '@' + myUsername;
    } else {
      display.textContent = '@' + myUsername;
      if (subtext) subtext.textContent = 'Set a display name';
    }
  });
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
    
    var avatarHtml = '<div class="avatar" id="avatar-' + otherUid + '">' + escapeHtml(name[0].toUpperCase()) + '</div>';
    
    item.innerHTML =
      avatarHtml +
      '<div class="contact-info">' +
        '<div class="contact-name" id="name-' + otherUid + '">' + escapeHtml(name) + '</div>' +
        '<div class="contact-code" id="unread-' + otherUid + '"></div>' +
      '</div>' +
      '<div class="contact-options-btn" id="opt-' + otherUid + '">⋮</div>' +
      '<div class="status-dot" id="dot-' + otherUid + '"></div>';
    
    // Load user's profile details (image and display name)
    db.ref('users/' + otherUid).once('value').then(function(snap) {
      if (snap.exists()) {
        var userData = snap.val();
        var avatarEl = document.getElementById('avatar-' + otherUid);
        var nameEl = document.getElementById('name-' + otherUid);
        var subEl = document.getElementById('sub-' + otherUid);

        if (userData.profileImage && avatarEl) {
          avatarEl.innerHTML = '<img src="' + userData.profileImage + '" alt="Profile" style="width:100%; height:100%; border-radius:8px; object-fit:cover;">';
        }
        
        if (userData.displayName && nameEl) {
          nameEl.textContent = userData.displayName;
        }
      }
    });
    
    watchUnread('messages/' + chatId(uid, otherUid), 'unread-' + otherUid);
    
    // Clicking the item opens the DM
    item.onclick = function(e) {
      if (e.target.classList.contains('contact-options-btn')) return;
      openDM(otherUid, name);
    };
    
    // Clicking the three dots opens the context menu
    var optBtn = item.querySelector('.contact-options-btn');
    if (optBtn) {
      optBtn.onclick = function(e) {
        e.stopPropagation();
        showContactContextMenu(e, otherUid, name);
      };
    }
    
    list.appendChild(item);
    watchPresence(otherUid);
  });
}

function showContactContextMenu(e, otherUid, name) {
  var menu = document.getElementById('contactContextMenu');
  menu.style.display = 'block';
  menu.style.left = e.pageX + 'px';
  menu.style.top = e.pageY + 'px';
  
  // Update menu actions
  document.getElementById('menuViewProfile').onclick = function() {
    menu.style.display = 'none';
    openUserProfile(otherUid);
  };
  
  document.getElementById('menuRemoveFriend').onclick = function() {
    menu.style.display = 'none';
    removeFriend(otherUid, name);
  };
  
  document.getElementById('menuBlockUser').onclick = function() {
    menu.style.display = 'none';
    blockUser(otherUid, name);
  };
  
  // Close menu when clicking elsewhere
  var closeMenu = function() {
    menu.style.display = 'none';
    document.removeEventListener('click', closeMenu);
  };
  setTimeout(function() {
    document.addEventListener('click', closeMenu);
  }, 10);
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
  var input = document.getElementById('addContactInput');
  if (input) input.value = '';
  var err = document.getElementById('addContactError');
  if (err) err.style.display = 'none';
  var results = document.getElementById('searchResults');
  if (results) results.innerHTML = '<div class="loading-spinner">Searching for accounts...</div>';
  openModal('addContactModal');
  loadPotentialContacts();
}

function closeAddContactModal() {
  closeModal('addContactModal');
}

function searchUsers(query) {
  filterSuggestions(query);
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
        
        suggestions.push({
          uid: otherUid,
          username: otherUser.username || 'Unknown',
          displayName: otherUser.displayName || '',
          profileImage: otherUser.profileImage || ''
        });
      }
    }
    
    allPotentialContacts = suggestions;
    renderSuggestions(suggestions);
    
  } catch (error) {
    console.error("Error loading suggestions:", error);
    var res = document.getElementById('searchResults');
    if (res) res.innerHTML = '<div style="padding:20px; text-align:center; color:var(--danger)">Failed to load accounts</div>';
  }
}

function renderSuggestions(suggestions) {
  const list = document.getElementById('searchResults');
  if (!list) return;
  list.innerHTML = '';
  
  if (suggestions.length === 0) {
    list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">No users found</div>';
    return;
  }
  
  suggestions.forEach(person => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid var(--border);';
    
    const avatar = person.profileImage 
      ? `<img src="${person.profileImage}" alt="Avatar" style="width:40px; height:40px; border-radius:10px; object-fit:cover;">`
      : `<div class="suggestion-avatar" style="width:40px; height:40px; border-radius:10px; background:var(--brand-gradient); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">${(person.displayName || person.username || '?')[0].toUpperCase()}</div>`;
      
    item.innerHTML = `
      <div class="suggestion-info" style="display:flex; align-items:center; gap:12px;">
        ${avatar}
        <div>
          <div class="suggestion-name" style="font-weight:bold; color:var(--text);">${escapeHtml(person.displayName || person.username)}</div>
          <div class="suggestion-username" style="font-size:12px; color:var(--text-muted);">@${escapeHtml(person.username)}</div>
        </div>
      </div>
      <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="addContactById('${person.uid}', '${escapeHtml(person.username)}')">Add</button>
    `;
    list.appendChild(item);
  });
}

function filterSuggestions(query) {
  if (!query) {
    renderSuggestions(allPotentialContacts);
    return;
  }
  
  query = query.trim().toLowerCase();
  const filtered = allPotentialContacts.filter(p => 
    (p.username && p.username.toLowerCase().includes(query)) || 
    (p.displayName && p.displayName.toLowerCase().includes(query))
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
    if (!snap.exists() || snap.numChildren() === 0) {
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
  var list = document.getElementById('contactCheckboxList');
  list.innerHTML = '';
  
  // Load contacts for selection
  db.ref('contacts/' + uid).once('value').then(function(snap) {
    if (!snap.exists()) {
      list.innerHTML = '<p style="padding:10px; color:var(--text-muted); font-size:13px;">No contacts to add. Add some friends first!</p>';
      return;
    }
    
    snap.forEach(function(child) {
      var otherUid = child.key;
      var username = child.val().name;
      
      var item = document.createElement('div');
      item.className = 'group-member-select-item';
      item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:12px; cursor:pointer; transition:all 0.2s; margin-bottom:4px; border:1px solid transparent;';
      
      var avatarId = 'cb-avatar-' + otherUid;
      var avatarHtml = '<div class="avatar" id="' + avatarId + '" style="width:36px; height:36px; font-size:14px;">' + escapeHtml(username[0].toUpperCase()) + '</div>';
      
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'group-member-checkbox';
      checkbox.style.display = 'none';
      checkbox.value = otherUid;
      checkbox.setAttribute('data-username', username);
      checkbox.id = 'cb-' + otherUid;
      
      item.innerHTML = 
        avatarHtml + 
        '<div style="flex:1; min-width:0;">' +
          '<div class="member-name" id="cb-name-' + otherUid + '" style="font-weight:700; font-size:14px; color:var(--text);">' + escapeHtml(username) + '</div>' +
          '<div style="font-size:11px; color:var(--text-muted-dark);">@' + escapeHtml(username) + '</div>' +
        '</div>' +
        '<div class="check-mark" style="width:20px; height:20px; border-radius:50%; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; color:white; font-size:12px;">✓</div>';
      
      item.onclick = function() {
        checkbox.checked = !checkbox.checked;
        item.style.background = checkbox.checked ? 'rgba(255,107,0,0.1)' : 'transparent';
        item.style.borderColor = checkbox.checked ? 'var(--primary)' : 'transparent';
        item.querySelector('.check-mark').style.background = checkbox.checked ? 'var(--primary)' : 'transparent';
        item.querySelector('.check-mark').style.borderColor = checkbox.checked ? 'var(--primary)' : 'var(--border)';
      };
      
      // Load details
      db.ref('users/' + otherUid).once('value').then(function(uSnap) {
        if (uSnap.exists()) {
          var uData = uSnap.val();
          if (uData.displayName) document.getElementById('cb-name-' + otherUid).textContent = uData.displayName;
          if (uData.profileImage) document.getElementById(avatarId).innerHTML = '<img src="' + uData.profileImage + '" alt="Profile" style="width:100%; height:100%; border-radius:8px; object-fit:cover;">';
        }
      });
      
      item.appendChild(checkbox);
      list.appendChild(item);
    });
  });
  
  openModal('createGroupModal');
}

function closeCreateGroupModal() {
  closeModal('createGroupModal');
}

function createGroup() {
  var name = document.getElementById('groupNameInput').value.trim();
  var err = document.getElementById('createGroupError');
  if (!name) {
    if (err) { err.textContent = 'Please enter a group name'; err.style.display = 'block'; }
    return;
  }
  
  var selectedUids = [];
  document.querySelectorAll('.group-member-checkbox:checked').forEach(function(cb) {
    selectedUids.push(cb.value);
  });
  
  if (selectedUids.length === 0) {
    if (err) { err.textContent = 'Please select at least one member'; err.style.display = 'block'; }
    return;
  }
  
  // Pro limit check
  var limit = isPro ? 500 : 20;
  if (selectedUids.length > limit) {
    if (err) { err.textContent = 'Free users can only add up to 20 members. Upgrade to Pro for 500!'; err.style.display = 'block'; }
    return;
  }
  
  var groupRef = db.ref('groups').push();
  var groupId = groupRef.key;
  
  var groupData = {
    name: name,
    createdBy: uid,
    createdAt: Date.now(),
    memberCount: selectedUids.length + 1
  };
  
  groupRef.set(groupData).then(function() {
    // Add me as member
    db.ref('groupMembers/' + uid + '/' + groupId).set(true);
    
    // Add others
    selectedUids.forEach(function(otherUid) {
      db.ref('groupMembers/' + otherUid + '/' + groupId).set(true);
    });
    
    closeModal('createGroupModal');
    showToast('Group "' + name + '" created!');
    openGroup(groupId, name);
  }).catch(function(e) {
    if (err) { err.textContent = 'Error: ' + e.message; err.style.display = 'block'; }
  });
}

function openGroupSettings() {
  if (!currentGroupId) return;
  db.ref('groups/' + currentGroupId).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var g = snap.val();
    
    // Set group name in edit field
    var nameEdit = document.getElementById('groupNameEdit');
    if (nameEdit) nameEdit.value = g.name || '';
    
    // Reset add member field
    var addInput = document.getElementById('addMemberInput');
    if (addInput) addInput.value = '';
    
    var err = document.getElementById('groupSettingsError');
    if (err) err.style.display = 'none';
    
    loadGroupMembers();
    openModal('groupSettingsModal');
  });
}

function loadGroupMembers() {
  var list = document.getElementById('groupMemberList');
  if (!list) return;
  list.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted);">Loading members...</div>';
  
  db.ref('groupMembers').once('value').then(function(snap) {
    if (!snap.exists()) return;
    var allMembers = snap.val();
    list.innerHTML = '';
    
    Object.keys(allMembers).forEach(function(memberId) {
      if (allMembers[memberId][currentGroupId]) {
        db.ref('users/' + memberId).once('value').then(function(uSnap) {
          if (!uSnap.exists()) return;
          var u = uSnap.val();
          var item = document.createElement('div');
          item.className = 'member-item';
          item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid var(--border);';
          
          var name = u.displayName || u.username;
          item.innerHTML = '<div style="display:flex; align-items:center; gap:10px;">' +
            '<div class="avatar" style="width:30px; height:30px; font-size:12px;">' + escapeHtml(name[0].toUpperCase()) + '</div>' +
            '<div>' +
              '<div style="font-weight:700; font-size:13px; color:var(--text);">' + escapeHtml(name) + '</div>' +
              '<div style="font-size:11px; color:var(--text-muted-dark);">@' + escapeHtml(u.username) + '</div>' +
            '</div>' +
          '</div>';
          
          if (uid !== memberId) {
            // Check if I'm the owner to show remove button
            db.ref('groups/' + currentGroupId + '/createdBy').once('value').then(function(ownerSnap) {
              if (ownerSnap.val() === uid) {
                var btn = document.createElement('button');
                btn.textContent = '✕';
                btn.style.cssText = 'background:none; border:none; color:var(--danger); cursor:pointer; font-size:16px; padding:4px;';
                btn.onclick = function() { removeGroupMember(memberId); };
                item.appendChild(btn);
              }
            });
          } else {
            var badge = document.createElement('div');
            badge.textContent = 'You';
            badge.style.cssText = 'font-size:10px; background:var(--surface-light); padding:2px 6px; border-radius:4px; color:var(--text-muted);';
            item.appendChild(badge);
          }
          list.appendChild(item);
        });
      }
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

    var username = document.getElementById('addMemberInput').value.trim().toLowerCase();
    var errEl = document.getElementById('groupSettingsError');
    if (errEl) errEl.style.display = 'none';

    if (!username) {
      if (errEl) { errEl.textContent = 'Please enter a username'; errEl.style.display = 'block'; }
      return;
    }

    if (username.startsWith('@')) username = username.substring(1);

    if (username === myUsername.toLowerCase()) {
      if (errEl) { errEl.textContent = "That's your own username!"; errEl.style.display = 'block'; }
      return;
    }

      db.ref('usernames/' + username).once('value').then(function(uSnap) {
      if (!uSnap.exists()) {
        if (errEl) { errEl.textContent = 'User not found'; errEl.style.display = 'block'; }
        return;
      }
      
      var uData = uSnap.val();
      var memberId = (typeof uData === 'object') ? uData.uid : uData;
      
      if (!memberId) {
        if (errEl) { errEl.textContent = 'User data error'; errEl.style.display = 'block'; }
        return;
      }

      db.ref('groupMembers/' + memberId + '/' + currentGroupId).once('value').then(function(memberSnap) {
        if (memberSnap.exists()) {
          if (errEl) { errEl.textContent = 'User is already in this group'; errEl.style.display = 'block'; }
          return;
        }
        db.ref('groupMembers/' + memberId + '/' + currentGroupId).set(true);
        db.ref('groups/' + currentGroupId + '/memberCount').transaction(function(current) {
          return (current || 0) + 1;
        });
        document.getElementById('addMemberInput').value = '';
        showToast('Member added!');
        loadGroupMembers();
      });
    });
  });
}

function saveGroupName() {
  if (!currentGroupId) return;
  var newName = document.getElementById('groupNameEdit').value.trim();
  if (!newName) {
    showToast('Please enter a group name');
    return;
  }
  
  db.ref('groups/' + currentGroupId + '/name').set(newName).then(function() {
    showToast('Group name updated!');
    currentChatName = newName;
    document.getElementById('chatName').textContent = newName;
    loadGroups(); // Refresh sidebar
  }).catch(function(e) {
    showToast('Error: ' + e.message);
  });
}

function leaveGroup() {
  if (!currentGroupId) return;
  if (!confirm('Are you sure you want to leave this group?')) return;
  
  db.ref('groupMembers/' + uid + '/' + currentGroupId).remove().then(function() {
    db.ref('groups/' + currentGroupId + '/memberCount').transaction(function(current) {
      return Math.max((current || 1) - 1, 0);
    });
    showToast('You left the group');
    closeModal('groupSettingsModal');
    goBackToContacts();
    loadGroups();
  });
}

function closeGroupSettings() {
  closeModal('groupSettingsModal');
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
  var headerName = document.getElementById('chatName');
  var headerSubtitle = document.getElementById('chatSubtitle');
  
  headerAvatar.innerHTML = name[0].toUpperCase();
  headerAvatar.style.background = 'var(--gradient)';
  headerAvatar.onclick = function() { openUserProfile(otherUid); };
  
  // Try to load user's profile details for the header
  db.ref('users/' + otherUid).once('value').then(function(snap) {
    if (snap.exists() && currentChatUid === otherUid) {
      var userData = snap.val();
      if (userData.profileImage) {
        headerAvatar.innerHTML = '<img src="' + userData.profileImage + '" alt="Profile">';
      }
      if (userData.displayName) {
        headerName.textContent = userData.displayName;
        headerSubtitle.textContent = '@' + name;
      } else {
        headerName.textContent = '@' + name;
        headerSubtitle.textContent = 'UChat Member';
      }
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
  var displayNameEl = document.getElementById('userProfileDisplayName');
  var avatarEl = document.getElementById('userProfileAvatar');
  var statusEl = document.getElementById('userProfileStatus');
  var bioEl = document.getElementById('userProfileBio');
  var bioSection = document.getElementById('userProfileBioSection');
  var chatBtn = document.getElementById('userProfileChatBtn');
  
  // Set initial loading state
  nameEl.textContent = 'Loading...';
  displayNameEl.textContent = '';
  avatarEl.innerHTML = '?';
  statusEl.textContent = 'Fetching profile details...';
  bioSection.style.display = 'none';
  
  db.ref('users/' + targetUid).once('value').then(function(snap) {
    if (!snap.exists()) {
      showToast('User not found');
      return;
    }
    
    var data = snap.val();
    var username = data.username || 'User';
    
    if (data.displayName) {
      nameEl.textContent = data.displayName;
      displayNameEl.textContent = '@' + username;
    } else {
      nameEl.textContent = '@' + username;
      displayNameEl.textContent = 'UChat Member';
    }
    
    avatarEl.innerHTML = username[0].toUpperCase();
    statusEl.textContent = 'Member since ' + new Date(data.createdAt || Date.now()).toLocaleDateString();
    
    if (data.profileImage) {
      avatarEl.innerHTML = '<img src="' + data.profileImage + '" alt="Profile">';
    }
    
    if (data.bio) {
      bioEl.textContent = data.bio;
      bioSection.style.display = 'block';
    } else {
      bioSection.style.display = 'none';
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
      
      seenMessageIds.add(chatIdFromPath + '_' + child.key);
      
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
  if (!isMe) {
    var labelId = 'sender-label-' + m._key;
    var color = isGroup ? getMemberColor(m.sender) : '';
    var colorStyle = color ? 'color:' + color + ';' : '';
    senderLabel = '<div id="' + labelId + '" class="msg-sender-label" style="' + colorStyle + ' cursor: pointer;" onclick="openUserProfile(\'' + m.sender + '\')">@' + escapeHtml(m.senderName || m.sender || '') + '</div>';
    
    // Fetch and update with display name
    db.ref('users/' + m.sender + '/displayName').once('value').then(function(snap) {
      if (snap.exists()) {
        var el = document.getElementById(labelId);
        if (el) el.textContent = snap.val();
      }
    });
  }

  // --- REPLY RENDERING ---
  var replyHtml = '';
  if (m.replyTo) {
    var replyId = 'reply-name-' + m._key;
    replyHtml = '<div class="msg-reply-container">' +
      '<b id="' + replyId + '">@' + escapeHtml(m.replyTo.senderName) + '</b>: ' +
      escapeHtml(m.replyTo.text.substring(0, 50)) + (m.replyTo.text.length > 50 ? '...' : '') +
      '</div>';
      
    // Fetch and update reply name with display name
    db.ref('users/' + m.replyTo.sender + '/displayName').once('value').then(function(snap) {
      if (snap.exists()) {
        var el = document.getElementById(replyId);
        if (el) el.textContent = snap.val();
      }
    });
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
  
  // --- PRE-APPLY MY APPEARANCE (Anti-Flicker) ---
  if (isMe) {
    var msgEl = div.querySelector('.message');
    if (userSettings.bubbleColor) {
      msgEl.style.background = userSettings.bubbleColor;
      msgEl.style.color = getContrastColor(userSettings.bubbleColor);
      
      // Add glow matching the color
      var color = userSettings.bubbleColor;
      if (color.startsWith('#')) {
        var r = parseInt(color.slice(1, 3), 16);
        var g = parseInt(color.slice(3, 5), 16);
        var b = parseInt(color.slice(5, 7), 16);
        msgEl.style.boxShadow = '0 4px 15px rgba(' + r + ',' + g + ',' + b + ', 0.25)';
      }
    }
    if (userSettings.bubbleStyle) {
      if (userSettings.bubbleStyle === 'rounded') msgEl.style.borderRadius = '18px';
      else if (userSettings.bubbleStyle === 'square') msgEl.style.borderRadius = '4px';
      else if (userSettings.bubbleStyle === 'pill') msgEl.style.borderRadius = '24px';
      msgEl.style.borderBottomRightRadius = '4px';
    }
  }

  box.appendChild(div);

  // --- SHARED APPEARANCE SYNC (For others) ---
  if (!isMe) {
    db.ref('users/' + m.sender + '/appearance').once('value').then(function(snap) {
      if (!snap.exists()) return;
      var app = snap.val();
      var msgEl = document.getElementById('msg-' + m._key);
      if (!msgEl) return;

      if (app.bubbleColor) {
        msgEl.style.background = app.bubbleColor;
        msgEl.style.color = getContrastColor(app.bubbleColor);
        msgEl.querySelectorAll('button, span').forEach(el => {
          if (!el.classList.contains('reaction-btn')) el.style.color = 'inherit';
        });
      }
      if (app.bubbleStyle) {
        if (app.bubbleStyle === 'rounded') msgEl.style.borderRadius = '18px';
        else if (app.bubbleStyle === 'square') msgEl.style.borderRadius = '4px';
        else if (app.bubbleStyle === 'pill') msgEl.style.borderRadius = '24px';
        msgEl.style.borderBottomLeftRadius = '4px';
      }
    });
  }
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
  
  // Pro limit check
  var sizeLimit = isPro ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > sizeLimit) {
    showToast(isPro ? 'File too large (max 100MB)' : 'File too large. Upgrade to Pro for 100MB limits!');
    event.target.value = '';
    return;
  }

  event.target.value = '';

  var progress = document.getElementById('uploadProgress');
  progress.style.display = 'block';

  var compressionLimit = isPro ? 5 * 1024 * 1024 : 1 * 1024 * 1024;
  if (file.size > compressionLimit) {
    progress.textContent = 'Compressing image...';
    compressImage(file, compressionLimit, function(compressedBase64) {
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
  // Legacy: cycle through themes
  var current = localStorage.getItem('theme') || 'default';
  var next = current === 'default' ? 'light' : current === 'light' ? 'warm' : 'default';
  setTheme(next);
}

function setTheme(theme) {
  document.body.classList.remove('light', 'warm');
  if (theme === 'light') document.body.classList.add('light');
  if (theme === 'warm') document.body.classList.add('warm');
  localStorage.setItem('theme', theme);
  // Update theme buttons
  ['Default', 'Light', 'Warm'].forEach(function(t) {
    var btn = document.getElementById('themeBtn' + t);
    var btnModal = document.getElementById('themeBtn' + t + 'Modal');
    if (btn) btn.classList.toggle('active', t.toLowerCase() === theme || (t === 'Default' && theme === 'default'));
    if (btnModal) btnModal.classList.toggle('active', t.toLowerCase() === theme || (t === 'Default' && theme === 'default'));
  });
  showToast('Theme switched to ' + (theme === 'default' ? 'Dark' : theme.charAt(0).toUpperCase() + theme.slice(1)));
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('open');
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



var lastCapturedPhoto = null;

function capturePhoto() {
  var video = document.getElementById('cameraVideo');
  var canvas = document.getElementById('cameraCanvas');
  var context = canvas.getContext('2d');
  
  if (!video.videoWidth) return;
  
  // Set canvas dimensions to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw video frame to canvas
  context.save();
  context.scale(-1, 1); // Mirror back for the actual photo
  context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  context.restore();
  
  // Convert to base64
  lastCapturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
  
  // Show preview on canvas and hide video
  video.style.display = 'none';
  canvas.style.display = 'block';
  
  // Show Send button, hide Capture button
  document.getElementById('sendPhotoBtn').style.display = 'block';
  document.querySelector('.capture-btn').style.display = 'none';
}

function sendCapturedPhoto() {
  if (lastCapturedPhoto) {
    sendCapturedImage(lastCapturedPhoto);
    closeCameraModal();
  }
}

function closeCameraModal() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  // Reset UI for next time
  var video = document.getElementById('cameraVideo');
  var canvas = document.getElementById('cameraCanvas');
  if (video) video.style.display = 'block';
  if (canvas) canvas.style.display = 'none';
  
  var sendBtn = document.getElementById('sendPhotoBtn');
  if (sendBtn) sendBtn.style.display = 'none';
  
  var captureBtn = document.querySelector('.capture-btn');
  if (captureBtn) captureBtn.style.display = 'block';
  
  lastCapturedPhoto = null;
  closeModal('cameraModal');
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
(function() {
  var savedTheme = localStorage.getItem('theme') || 'default';
  document.body.classList.remove('light', 'warm');
  if (savedTheme === 'light') document.body.classList.add('light');
  if (savedTheme === 'warm') document.body.classList.add('warm');
  // Update theme buttons after DOM ready
  setTimeout(function() {
    ['Default', 'Light', 'Warm'].forEach(function(t) {
      var btn = document.getElementById('themeBtn' + t);
      var btnModal = document.getElementById('themeBtn' + t + 'Modal');
      var isActive = t.toLowerCase() === savedTheme || (t === 'Default' && savedTheme === 'default');
      if (btn) btn.classList.toggle('active', isActive);
      if (btnModal) btnModal.classList.toggle('active', isActive);
    });
  }, 50);
})();

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
  bubbleColor: localStorage.getItem('bubbleColor') || '#ff6b00',
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
  userSettings.bubbleColor = '#ff6b00'; // Default primary (UChat orange)
  
  localStorage.removeItem('bubbleStyle');
  localStorage.removeItem('bubbleColor');
  
  if (uid) {
    db.ref('users/' + uid + '/appearance').remove();
  }
  
  // Update UI
  var styleSelect = document.getElementById('bubbleStyleSelect');
  var colorInput = document.getElementById('bubbleColorInput');
  if (styleSelect) styleSelect.value = 'rounded';
  if (colorInput) colorInput.value = '#ff6b00';
  
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
    var isMe = msg.parentElement.classList.contains('me');
    if (style === 'rounded') {
      msg.style.borderRadius = '18px';
    } else if (style === 'square') {
      msg.style.borderRadius = '4px';
    } else if (style === 'pill') {
      msg.style.borderRadius = '24px';
    }
    
    // Preserve side-specific tail
    if (isMe) msg.style.borderBottomRightRadius = '4px';
    else msg.style.borderBottomLeftRadius = '4px';
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
  
  // Create a glow color with lower opacity
  var glowColor = color;
  if (color.startsWith('#')) {
    var r = parseInt(color.slice(1, 3), 16);
    var g = parseInt(color.slice(3, 5), 16);
    var b = parseInt(color.slice(5, 7), 16);
    glowColor = 'rgba(' + r + ',' + g + ',' + b + ', 0.25)';
  }

  style.textContent = 
    '.msg-container.me .message { ' +
      'background: ' + color + ' !important; ' +
      'color: ' + getContrastColor(color) + ' !important; ' +
      'box-shadow: 0 4px 15px ' + glowColor + ' !important; ' +
    '}';
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
  
  // Load profile data including display name and bio
  db.ref('users/' + uid).once('value').then(function(snap) {
    if (!snap.exists()) return;
    var data = snap.val();
    
    // Load display name
    var displayNameEl = document.getElementById('profileDisplayName');
    if (displayNameEl && data.displayName) {
      displayNameEl.value = data.displayName;
    }
    
    // Load bio
    var bioEl = document.getElementById('profileBio');
    if (bioEl && data.bio) {
      bioEl.value = data.bio;
      updateBioCharCount();
    }
    
    // Load profile image
    if (data.profileImage && avatarEl) {
      avatarEl.textContent = '';
      avatarEl.innerHTML = '<img src="' + data.profileImage + '" alt="Profile" style="width:100%; height:100%; border-radius:12px; object-fit:cover;">';
    }
  }).catch(function(err) {
    console.error('Error loading profile data:', err);
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
function saveProfileDisplayName() {
  var displayNameEl = document.getElementById('profileDisplayName');
  var displayName = displayNameEl.value.trim();
  
  if (!displayName) {
    showToast('Please enter a display name');
    return;
  }
  
  db.ref('users/' + uid + '/displayName').set(displayName).then(function() {
    showToast('Display name updated!');
  }).catch(function(err) {
    showToast('Failed to save: ' + err.message);
  });
}

function saveProfileBio() {
  var bioEl = document.getElementById('profileBio');
  var bio = bioEl.value.trim();
  
  db.ref('users/' + uid + '/bio').set(bio).then(function() {
    showToast('Bio updated!');
  }).catch(function(err) {
    showToast('Failed to save: ' + err.message);
  });
}

function updateBioCharCount() {
  var bioEl = document.getElementById('profileBio');
  var charCountEl = document.getElementById('bioCharCount');
  if (charCountEl) {
    charCountEl.textContent = bioEl.value.length;
  }
}

function removeFriend(targetUid, name) {
  if (!confirm('Are you sure you want to remove ' + name + ' from your contacts?')) return;
  
  db.ref('contacts/' + uid + '/' + targetUid).remove().then(function() {
    showToast('Removed ' + name + ' from contacts');
    // If currently chatting with them, close the chat
    if (currentChatUid === targetUid) {
      goBackToContacts();
    }
    loadContacts();
  }).catch(function(err) {
    showToast('Failed to remove: ' + err.message);
  });
}

function blockUser(targetUid, name) {
  if (!confirm('Block ' + name + '? You will no longer receive messages from them.')) return;
  
  // 1. Add to blocked list
  db.ref('blocked/' + uid + '/' + targetUid).set(true).then(function() {
    // 2. Remove from contacts
    return db.ref('contacts/' + uid + '/' + targetUid).remove();
  }).then(function() {
    showToast(name + ' has been blocked');
    if (currentChatUid === targetUid) {
      goBackToContacts();
    }
    loadContacts();
  }).catch(function(err) {
    showToast('Failed to block: ' + err.message);
  });
}
