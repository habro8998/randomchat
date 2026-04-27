const socket = io();

let nickname = "";
let university = "";
let gender = "";
let connected = false;
let currentPartnerName = "";
let lastSender = "";
let myTyping = false;
let typingTimeoutId = null;
let partnerTypingTimeoutId = null;
let lastReadMessageId = null;
let readReceiptTimeoutId = null;
let pokeToastTimeoutId = null;
let locationWatchId = null;
let locationStopTimeoutId = null;
let locationRequestPending = false;
let incomingLocationRequestPending = false;
let isLocationSharing = false;
let myLocation = null;
let opponentLocation = null;

const myMessageStatusMap = new Map();
const bannedWords = ["욕설", "비하", "혐오"];
const LOCATION_SHARE_DURATION_MS = 15 * 60 * 1000;

function startChat() {
  nickname = document.getElementById("nickname").value.trim();
  university = document.getElementById("university").value;
  gender = document.getElementById("gender").value;

  if (!nickname) {
    alert("닉네임을 입력해주세요.");
    return;
  }
  if (!university) {
    alert("대학교 카테고리를 선택해주세요.");
    return;
  }
  if (!gender) {
    alert("성별을 선택해주세요.");
    return;
  }

  document.getElementById("homeSection").style.display = "none";
  document.getElementById("chatSection").style.display = "block";

  document.getElementById("chatTitle").innerText = university + " 랜덤채팅";
  document.getElementById("userInfo").innerText = "나: " + nickname;
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";

  resetConversationState();
  setStatus("상대 찾는 중...");
  addMessage("system", university + " 카테고리에서 상대를 찾고 있습니다.");

  socket.emit("join", { nickname, university, gender });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  if (!connected) {
    alert("아직 상대와 연결되지 않았습니다.");
    return;
  }
  if (containsBannedWord(text)) {
    alert("부적절한 표현이 포함되어 있습니다.");
    return;
  }

  const messageId = createMessageId();
  addMessage("me", text, nickname, { messageId, status: "전송됨" });
  socket.emit("message", { messageId, text });

  input.value = "";
  stopTyping();
}

function nextPartner() {
  stopLocationSharing("상대 변경으로 위치 공유가 종료되었습니다.");
  resetConversationState();
  connected = false;
  currentPartnerName = "";

  setStatus("새 상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";
  addMessage("system", "새로운 상대를 찾고 있습니다.");

  socket.emit("next");
}

function blockUser() {
  if (!connected) {
    alert("현재 차단할 상대가 없습니다.");
    return;
  }

  stopLocationSharing("차단으로 위치 공유가 종료되었습니다.");
  resetConversationState();
  connected = false;
  currentPartnerName = "";

  setStatus("새 상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";
  addMessage("system", "상대를 차단하고 새로운 상대를 찾고 있습니다.");

  socket.emit("block");
}

function leaveChat() {
  stopLocationSharing("", false);
  location.reload();
}

function addMessage(type, text, senderName = "", options = {}) {
  const chatBox = document.getElementById("chatBox");
  removeTypingIndicator();

  if (type === "system") {
    const div = document.createElement("div");
    div.className = "message system";
    div.innerText = text;
    chatBox.appendChild(div);
    scrollToBottom();
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrap " + (type === "me" ? "me-wrap" : "other-wrap");

  const senderKey = type === "me" ? "me" : "other";
  const shouldShowName = lastSender !== senderKey;

  if (shouldShowName) {
    const nameTag = document.createElement("div");
    nameTag.className = "sender-name";
    nameTag.innerText = senderName || (type === "me" ? nickname : currentPartnerName || "상대");
    wrapper.appendChild(nameTag);
  }

  const bubble = document.createElement("div");
  bubble.className = "message " + type;
  bubble.innerText = text;
  wrapper.appendChild(bubble);

  if (type === "me" && options.messageId) {
    const meta = document.createElement("div");
    meta.className = "message-meta hidden";
    wrapper.appendChild(meta);
    myMessageStatusMap.set(options.messageId, meta);
  }

  chatBox.appendChild(wrapper);
  lastSender = senderKey;
  scrollToBottom();
}

function showTypingIndicator() {
  const chatBox = document.getElementById("chatBox");
  const exists = document.getElementById("typingIndicator");
  if (exists || !connected) return;

  const indicator = document.createElement("div");
  indicator.id = "typingIndicator";
  indicator.className = "typing-indicator";
  indicator.innerText = "입력 중...";
  chatBox.appendChild(indicator);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typingIndicator");
  if (indicator) {
    indicator.remove();
  }
}

function setStatus(text) {
  document.getElementById("status").innerText = text;
}

function clearChat() {
  document.getElementById("chatBox").innerHTML = "";
}

function resetConversationState() {
  clearChat();
  stopTyping();
  removeTypingIndicator();
  lastSender = "";
  myMessageStatusMap.clear();
  lastReadMessageId = null;
  if (readReceiptTimeoutId) {
    clearTimeout(readReceiptTimeoutId);
    readReceiptTimeoutId = null;
  }
  closePokeMenu();
  hidePokeToast();
  closeLocationConsent();
  closeOpponentLocationConsent();
  hideLocationCard();
}

function containsBannedWord(message) {
  return bannedWords.some((word) => message.includes(word));
}

function createMessageId() {
  return "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function scrollToBottom() {
  const chatBox = document.getElementById("chatBox");
  chatBox.scrollTop = chatBox.scrollHeight;
}

function startTyping() {
  if (!connected) return;
  if (!myTyping) {
    myTyping = true;
    socket.emit("typing_start");
  }
}

function stopTyping() {
  if (!myTyping) return;
  myTyping = false;
  socket.emit("typing_stop");
}

function showReadReceipt(messageId) {
  if (lastReadMessageId && myMessageStatusMap.has(lastReadMessageId)) {
    const prevMeta = myMessageStatusMap.get(lastReadMessageId);
    prevMeta.innerText = "";
    prevMeta.classList.add("hidden");
  }

  const target = myMessageStatusMap.get(messageId);
  if (!target) return;

  target.innerText = "읽음";
  target.classList.remove("hidden");
  lastReadMessageId = messageId;

  if (readReceiptTimeoutId) {
    clearTimeout(readReceiptTimeoutId);
  }
  readReceiptTimeoutId = setTimeout(() => {
    if (target) {
      target.innerText = "";
      target.classList.add("hidden");
    }
    readReceiptTimeoutId = null;
  }, 3000);
}

function showPokeToast(message) {
  const toast = document.getElementById("pokeToast");
  toast.innerText = message;
  toast.classList.add("show");

  if (pokeToastTimeoutId) {
    clearTimeout(pokeToastTimeoutId);
  }
  pokeToastTimeoutId = setTimeout(() => {
    hidePokeToast();
  }, 2500);
}

function hidePokeToast() {
  const toast = document.getElementById("pokeToast");
  toast.classList.remove("show");
  toast.innerText = "";
  if (pokeToastTimeoutId) {
    clearTimeout(pokeToastTimeoutId);
    pokeToastTimeoutId = null;
  }
}

function togglePokeMenu() {
  if (!connected) {
    alert("상대와 연결된 뒤에 사용할 수 있습니다.");
    return;
  }
  const modal = document.getElementById("pokeMenuModal");
  modal.classList.toggle("show");
}

function closePokeMenu() {
  document.getElementById("pokeMenuModal").classList.remove("show");
}

function sendPoke(topic) {
  if (!connected) {
    closePokeMenu();
    return;
  }
  socket.emit("poke_send", { topic });
  closePokeMenu();
}

function openLocationConsent() {
  if (!connected) {
    alert("상대와 연결된 뒤에 사용할 수 있습니다.");
    return;
  }
  if (isLocationSharing || locationRequestPending) {
    return;
  }
  document.getElementById("locationConsentModal").classList.add("show");
}

function closeLocationConsent() {
  document.getElementById("locationConsentModal").classList.remove("show");
}

function closeOpponentLocationConsent() {
  document.getElementById("opponentLocationConsentModal").classList.remove("show");
}

function approveLocationConsent() {
  closeLocationConsent();
  locationRequestPending = true;
  socket.emit("location_share_request");
  addMessage("system", "위치 공유 요청을 보냈습니다. 상대 동의를 기다리는 중입니다.");
}

function rejectOpponentLocationConsent() {
  incomingLocationRequestPending = false;
  closeOpponentLocationConsent();
  socket.emit("location_share_response", { accepted: false });
}

function approveOpponentLocationConsent() {
  requestLocationPermission(
    () => {
      incomingLocationRequestPending = false;
      closeOpponentLocationConsent();
      socket.emit("location_share_response", { accepted: true });
    },
    () => {
      incomingLocationRequestPending = false;
      closeOpponentLocationConsent();
      socket.emit("location_share_response", { accepted: false, reason: "permission_denied" });
      addMessage("system", "위치 권한이 필요합니다.");
    }
  );
}

function requestLocationPermission(onSuccess, onFail) {
  if (!navigator.geolocation) {
    addMessage("system", "이 브라우저는 위치 공유를 지원하지 않습니다.");
    if (onFail) onFail();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      myLocation = {
        userId: socket.id || "me",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        updatedAt: new Date().toISOString()
      };
      if (onSuccess) onSuccess();
    },
    () => {
      addMessage("system", "위치 권한이 필요합니다.");
      if (onFail) onFail();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function startLocationSharing() {
  if (isLocationSharing) return;
  isLocationSharing = true;
  renderLocationCard();
  startLocationWatch();

  if (locationStopTimeoutId) {
    clearTimeout(locationStopTimeoutId);
  }
  locationStopTimeoutId = setTimeout(() => {
    stopLocationSharing("위치 공유가 15분이 지나 자동 종료되었습니다.");
  }, LOCATION_SHARE_DURATION_MS);
}

function startLocationWatch() {
  if (!navigator.geolocation) return;
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      myLocation = {
        userId: socket.id || "me",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        updatedAt: new Date().toISOString()
      };
      socket.emit("location_update", { location: myLocation });
      renderLocationCard();
    },
    () => {
      addMessage("system", "위치 공유 중 오류가 발생했습니다.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function stopLocationSharing(message = "", notifyPartner = true) {
  if (locationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  if (locationStopTimeoutId) {
    clearTimeout(locationStopTimeoutId);
    locationStopTimeoutId = null;
  }
  if (notifyPartner && (isLocationSharing || locationRequestPending || incomingLocationRequestPending)) {
    socket.emit("location_share_stop");
  }
  isLocationSharing = false;
  locationRequestPending = false;
  incomingLocationRequestPending = false;
  myLocation = null;
  opponentLocation = null;
  hideLocationCard();
  if (message) {
    addMessage("system", message);
  }
}

function stopLocationSharingByButton() {
  stopLocationSharing("위치 공유를 중지했습니다.");
}

function hideLocationCard() {
  const card = document.getElementById("locationShareCard");
  card.classList.remove("show");
  card.innerHTML = "";
}

function renderLocationCard() {
  if (!isLocationSharing) {
    hideLocationCard();
    return;
  }
  const card = document.getElementById("locationShareCard");
  const myText = myLocation
    ? `${myLocation.latitude.toFixed(5)}, ${myLocation.longitude.toFixed(5)}`
    : "위치 업데이트 대기 중";
  const otherText = opponentLocation
    ? `${opponentLocation.latitude.toFixed(5)}, ${opponentLocation.longitude.toFixed(5)}`
    : "상대 위치 대기 중";

  card.innerHTML = `
    <h4>실시간 위치 공유 중</h4>
    <div class="location-grid">
      <div class="location-cell">내 위치 핀<br />${myText}</div>
      <div class="location-cell">상대 위치 핀<br />${otherText}</div>
    </div>
    <button class="location-stop-btn" onclick="stopLocationSharingByButton()">위치 공유 중지</button>
  `;
  card.classList.add("show");
}

socket.on("waiting", (msg) => {
  connected = false;
  currentPartnerName = "";
  setStatus("대기 중");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";
  addMessage("system", msg);
});

socket.on("matched", (data) => {
  connected = true;
  nickname = data.myName || nickname;
  currentPartnerName = data.partnerName || "익명";

  setStatus("상대와 연결됨");
  document.getElementById("userInfo").innerText = "나: " + nickname;
  document.getElementById("partnerInfo").innerText = "상대: " + currentPartnerName;
  addMessage("system", currentPartnerName + "님과 연결되었습니다.");
});

socket.on("message", (data) => {
  addMessage("other", data.text, data.senderName || currentPartnerName || "상대");
  if (data.messageId) {
    socket.emit("message_read", { messageId: data.messageId });
  }
});

socket.on("message_read", (data) => {
  if (data?.messageId) {
    showReadReceipt(data.messageId);
  }
});

socket.on("poke_received", (data) => {
  if (!data?.topic) return;
  showPokeToast(`상대방이 ${data.topic}를 찔러봤습니다!`);
});

socket.on("location_share_requested", () => {
  if (!connected) return;
  incomingLocationRequestPending = true;
  document.getElementById("opponentLocationConsentModal").classList.add("show");
});

socket.on("location_share_response", (data) => {
  locationRequestPending = false;
  if (!data?.accepted) {
    addMessage("system", "상대가 위치 공유를 거절했습니다.");
    return;
  }

  requestLocationPermission(
    () => {
      addMessage("system", "서로 동의가 완료되어 위치 공유를 시작합니다.");
      startLocationSharing();
      socket.emit("location_share_ready");
    },
    () => {
      socket.emit("location_share_stop");
    }
  );
});

socket.on("location_share_started", () => {
  if (!isLocationSharing) {
    startLocationSharing();
  }
  addMessage("system", "실시간 위치 공유 중입니다.");
});

socket.on("location_update", (data) => {
  if (!isLocationSharing || !data?.location) return;
  opponentLocation = data.location;
  renderLocationCard();
});

socket.on("location_share_stopped", (data) => {
  stopLocationSharing(data?.message || "상대가 위치 공유를 종료했습니다.", false);
});

socket.on("typing_start", () => {
  showTypingIndicator();
  if (partnerTypingTimeoutId) {
    clearTimeout(partnerTypingTimeoutId);
  }
  partnerTypingTimeoutId = setTimeout(() => {
    removeTypingIndicator();
  }, 1000);
});

socket.on("typing_stop", () => {
  removeTypingIndicator();
  if (partnerTypingTimeoutId) {
    clearTimeout(partnerTypingTimeoutId);
    partnerTypingTimeoutId = null;
  }
});

socket.on("partnerLeft", (msg) => {
  connected = false;
  currentPartnerName = "";
  stopLocationSharing("", false);
  removeTypingIndicator();
  setStatus("상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";
  addMessage("system", msg);
});

socket.on("blocked", (msg) => {
  addMessage("system", msg);
});

socket.on("presence_stats", (stats) => {
  document.getElementById("totalUsers").innerText =
    "전체 접속자: " + (stats.total || 0) + "명";
  document.getElementById("maleStats").innerText =
    "남자 대기/채팅: " +
    (stats.male?.waiting || 0) +
    "명 / " +
    (stats.male?.chatting || 0) +
    "명";
  document.getElementById("femaleStats").innerText =
    "여자 대기/채팅: " +
    (stats.female?.waiting || 0) +
    "명 / " +
    (stats.female?.chatting || 0) +
    "명";
});

document.getElementById("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

document.getElementById("messageInput").addEventListener("input", (e) => {
  const value = e.target.value.trim();
  if (!connected) return;

  if (value) {
    startTyping();
    if (typingTimeoutId) {
      clearTimeout(typingTimeoutId);
    }
    typingTimeoutId = setTimeout(() => {
      stopTyping();
    }, 1000);
  } else {
    if (typingTimeoutId) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    stopTyping();
  }
});