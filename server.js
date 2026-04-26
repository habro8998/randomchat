const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const waitingUsers = {};
const partners = {};

io.on("connection", (socket) => {
  socket.on("join", ({ nickname, university, gender }) => {
    socket.nickname = nickname;
    socket.university = university;
    socket.gender = gender;

    matchUser(socket);
  });

  socket.on("message", (msg) => {
    const partnerId = partners[socket.id];

    if (partnerId) {
      io.to(partnerId).emit("message", {
        text: msg,
        senderName: socket.nickname || "익명",
        senderGender: socket.gender || "성별 미선택"
      });
    }
  });

  socket.on("next", () => {
    disconnectPartner(socket);
    matchUser(socket);
  });

  socket.on("report", () => {
    const partnerId = partners[socket.id];

    if (partnerId) {
      io.to(partnerId).emit("partnerLeft", "상대가 대화를 종료했습니다.");
      delete partners[partnerId];
      delete partners[socket.id];
    }

    socket.emit("reported", "신고가 접수되었습니다.");
    matchUser(socket);
  });

  socket.on("disconnect", () => {
    removeFromWaiting(socket);
    disconnectPartner(socket);
  });
});

function matchUser(socket) {
  const university = socket.university;
  if (!university) return;

  if (!waitingUsers[university]) {
    waitingUsers[university] = [];
  }

  waitingUsers[university] = waitingUsers[university].filter(
    (id) => id !== socket.id
  );

  const partnerId = waitingUsers[university].find((id) => id !== socket.id);

  if (partnerId) {
    waitingUsers[university] = waitingUsers[university].filter(
      (id) => id !== partnerId
    );

    const partnerSocket = io.sockets.sockets.get(partnerId);

    partners[socket.id] = partnerId;
    partners[partnerId] = socket.id;

    socket.emit("matched", {
      myName: socket.nickname || "익명",
      myGender: socket.gender || "성별 미선택",
      partnerName: partnerSocket?.nickname || "익명",
      partnerGender: partnerSocket?.gender || "성별 미선택"
    });

    io.to(partnerId).emit("matched", {
      myName: partnerSocket?.nickname || "익명",
      myGender: partnerSocket?.gender || "성별 미선택",
      partnerName: socket.nickname || "익명",
      partnerGender: socket.gender || "성별 미선택"
    });
  } else {
    waitingUsers[university].push(socket.id);
    socket.emit("waiting", "상대를 찾는 중입니다...");
  }
}

function disconnectPartner(socket) {
  const partnerId = partners[socket.id];

  if (partnerId) {
    io.to(partnerId).emit("partnerLeft", "상대가 나갔습니다. 새로운 상대를 찾고 있습니다.");

    delete partners[partnerId];
    delete partners[socket.id];

    const partnerSocket = io.sockets.sockets.get(partnerId);

    if (partnerSocket) {
      setTimeout(() => {
        matchUser(partnerSocket);
      }, 500);
    }
  }
}

function removeFromWaiting(socket) {
  const university = socket.university;

  if (university && waitingUsers[university]) {
    waitingUsers[university] = waitingUsers[university].filter(
      (id) => id !== socket.id
    );
  }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
