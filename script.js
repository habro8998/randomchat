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
let touchStartY = 0;
let touchStartX = 0;

const myMessageStatusMap = new Map();
const bannedWords = ["욕설", "비하", "혐오"];
const SWIPE_THRESHOLD = 90;

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

  resetConversationState();
  connected = false;
  currentPartnerName = "";

  setStatus("새 상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";
  addMessage("system", "상대를 차단하고 새로운 상대를 찾고 있습니다.");

  socket.emit("block");
}

function leaveChat() {
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
    meta.className = "message-meta";
    meta.innerText = options.status || "전송됨";
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

function setupSwipeForNextPartner() {
  const chatBox = document.getElementById("chatBox");
  chatBox.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.changedTouches[0];
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
    },
    { passive: true }
  );

  chatBox.addEventListener(
    "touchend",
    (e) => {
      const touch = e.changedTouches[0];
      const deltaY = touchStartY - touch.clientY;
      const deltaX = Math.abs(touch.clientX - touchStartX);
      if (deltaY > SWIPE_THRESHOLD && deltaX < 80) {
        nextPartner();
      }
    },
    { passive: true }
  );
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
  const target = myMessageStatusMap.get(data?.messageId);
  if (target) {
    target.innerText = "읽음";
  }
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

setupSwipeForNextPartner();