const socket = io();

let nickname = "";
let university = "";
let gender = "";
let connected = false;
let currentPartnerName = "";
let currentPartnerGender = "";

const bannedWords = ["욕설", "비하", "혐오"];

function startChat() {
  nickname = document.getElementById("nickname").value.trim();
  gender = document.getElementById("gender").value;
  university = document.getElementById("university").value;

  if (!nickname) {
    alert("닉네임을 입력해주세요.");
    return;
  }

  if (!gender) {
    alert("성별을 선택해주세요.");
    return;
  }

  if (!university) {
    alert("대학교 카테고리를 선택해주세요.");
    return;
  }

  document.getElementById("homeSection").style.display = "none";
  document.getElementById("chatSection").style.display = "block";

  document.getElementById("chatTitle").innerText = university + " 랜덤채팅";
  document.getElementById("userInfo").innerText = "나: " + nickname + " (" + gender + ")";
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";

  clearChat();
  setStatus("상대 찾는 중...");
  addMessage("system", university + " 카테고리에서 상대를 찾고 있습니다.");

  socket.emit("join", {
    nickname,
    university,
    gender
  });
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();

  if (!message) return;

  if (!connected) {
    alert("아직 상대와 연결되지 않았습니다.");
    return;
  }

  if (containsBannedWord(message)) {
    alert("부적절한 표현이 포함되어 있습니다.");
    return;
  }

  addMessage("me", message, nickname + " (" + gender + ")");
  socket.emit("message", message);

  input.value = "";
}

function nextPartner() {
  clearChat();
  connected = false;
  currentPartnerName = "";
  currentPartnerGender = "";

  setStatus("새 상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";

  addMessage("system", "새로운 상대를 찾고 있습니다.");
  socket.emit("next");
}

function reportUser() {
  alert("신고가 접수되었습니다.");

  connected = false;
  currentPartnerName = "";
  currentPartnerGender = "";

  clearChat();
  setStatus("새 상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";

  socket.emit("report");
}

function leaveChat() {
  location.reload();
}

function addMessage(type, text, senderName = "") {
  const chatBox = document.getElementById("chatBox");

  if (type === "system") {
    const div = document.createElement("div");
    div.className = "message system";
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrap " + (type === "me" ? "me-wrap" : "other-wrap");

  const nameTag = document.createElement("div");
  nameTag.className = "sender-name";
  nameTag.innerText = senderName || (type === "me"
    ? nickname + " (" + gender + ")"
    : currentPartnerName + " (" + currentPartnerGender + ")");

  const bubble = document.createElement("div");
  bubble.className = "message " + type;
  bubble.innerText = text;

  wrapper.appendChild(nameTag);
  wrapper.appendChild(bubble);

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function clearChat() {
  document.getElementById("chatBox").innerHTML = "";
}

function setStatus(text) {
  document.getElementById("status").innerText = text;
}

function containsBannedWord(message) {
  return bannedWords.some((word) => message.includes(word));
}

socket.on("waiting", (msg) => {
  connected = false;
  currentPartnerName = "";
  currentPartnerGender = "";

  setStatus("대기 중");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";

  addMessage("system", msg);
});

socket.on("matched", (data) => {
  connected = true;

  nickname = data.myName || nickname;
  gender = data.myGender || gender;
  currentPartnerName = data.partnerName || "익명";
  currentPartnerGender = data.partnerGender || "성별 미선택";

  setStatus("상대와 연결됨");

  document.getElementById("userInfo").innerText = "나: " + nickname + " (" + gender + ")";
  document.getElementById("partnerInfo").innerText =
    "상대: " + currentPartnerName + " (" + currentPartnerGender + ")";

  addMessage(
    "system",
    currentPartnerName + " (" + currentPartnerGender + ")님과 연결되었습니다."
  );
});

socket.on("message", (data) => {
  const sender = data.senderName + " (" + data.senderGender + ")";
  addMessage("other", data.text, sender);
});

socket.on("partnerLeft", (msg) => {
  connected = false;
  currentPartnerName = "";
  currentPartnerGender = "";

  setStatus("상대 찾는 중...");
  document.getElementById("partnerInfo").innerText = "상대: 찾는 중";

  addMessage("system", msg);
});

socket.on("reported", (msg) => {
  addMessage("system", msg);
});

document.getElementById("messageInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});
