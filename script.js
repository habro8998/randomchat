const socket = io();

let nickname = "";
let university = "";
let connected = false;

const bannedWords = ["욕설", "비하", "혐오"];

function startChat() {
  nickname = document.getElementById("nickname").value.trim();
  university = document.getElementById("university").value;

  if (!nickname) {
    alert("닉네임을 입력해주세요.");
    return;
  }

  if (!university) {
    alert("대학교 카테고리를 선택해주세요.");
    return;
  }

  document.getElementById("homeSection").style.display = "none";
  document.getElementById("chatSection").style.display = "block";

  document.getElementById("chatTitle").innerText = university + " 랜덤채팅";
  document.getElementById("userInfo").innerText = nickname + "님으로 접속 중";

  clearChat();
  setStatus("상대 찾는 중...");
  addMessage("system", university + " 카테고리에서 상대를 찾고 있습니다.");

  socket.emit("join", {
    nickname,
    university
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

  addMessage("me", message);
  socket.emit("message", message);

  input.value = "";
}

function nextPartner() {
  clearChat();
  connected = false;
  setStatus("새 상대 찾는 중...");
  addMessage("system", "새로운 상대를 찾고 있습니다.");
  socket.emit("next");
}

function reportUser() {
  alert("신고가 접수되었습니다.");
  connected = false;
  clearChat();
  setStatus("새 상대 찾는 중...");
  socket.emit("report");
}

function leaveChat() {
  location.reload();
}

function addMessage(type, text) {
  const chatBox = document.getElementById("chatBox");
  const div = document.createElement("div");

  div.className = "message " + type;
  div.innerText = text;

  chatBox.appendChild(div);
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
  setStatus("대기 중");
  addMessage("system", msg);
});

socket.on("matched", (msg) => {
  connected = true;
  setStatus("상대와 연결됨");
  addMessage("system", msg);
});

socket.on("message", (msg) => {
  addMessage("other", msg);
});

socket.on("partnerLeft", (msg) => {
  connected = false;
  setStatus("상대 찾는 중...");
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