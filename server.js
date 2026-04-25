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
  console.log("접속:", socket.id);

  socket.on("join", ({ nickname, university }) => {
    socket.nickname = nickname;
    socket.university = university;

    if (!waitingUsers[university]) {
      waitingUsers[university] = [];
    }

    const partner = waitingUsers[university].find((id) => id !== socket.id);

    if (partner) {
      waitingUsers[university] = waitingUsers[university].filter((id) => id !== partner);

      partners[socket.id] = partner;
      partners[partner] = socket.id;

      socket.emit("matched", "상대와 연결되었습니다.");
      io.to(partner).emit("matched", "상대와 연결되었습니다.");
    } else {
      waitingUsers[university].push(socket.id);
      socket.emit("waiting", "상대를 찾는 중입니다...");
    }
  });

  socket.on("message", (msg) => {
    const partner = partners[socket.id];

    if (partner) {
      io.to(partner).emit("message", msg);
    }
  });

  socket.on("next", () => {
    disconnectPartner(socket);
    rejoin(socket);
  });

  socket.on("report", () => {
    const partner = partners[socket.id];

    if (partner) {
      io.to(partner).emit("partnerLeft", "상대가 대화를 종료했습니다.");
      delete partners[partner];
      delete partners[socket.id];
    }

    socket.emit("reported", "신고가 접수되었습니다.");
    rejoin(socket);
  });

  socket.on("disconnect", () => {
    console.log("나감:", socket.id);
    removeFromWaiting(socket);
    disconnectPartner(socket);
  });
});

function rejoin(socket) {
  if (!socket.nickname || !socket.university) return;

  setTimeout(() => {
    socket.emit("waiting", "새로운 상대를 찾는 중입니다...");

    if (!waitingUsers[socket.university]) {
      waitingUsers[socket.university] = [];
    }

    const partner = waitingUsers[socket.university].find((id) => id !== socket.id);

    if (partner) {
      waitingUsers[socket.university] = waitingUsers[socket.university].filter((id) => id !== partner);

      partners[socket.id] = partner;
      partners[partner] = socket.id;

      socket.emit("matched", "새로운 상대와 연결되었습니다.");
      io.to(partner).emit("matched", "새로운 상대와 연결되었습니다.");
    } else {
      waitingUsers[socket.university].push(socket.id);
    }
  }, 500);
}

function disconnectPartner(socket) {
  const partner = partners[socket.id];

  if (partner) {
    io.to(partner).emit("partnerLeft", "상대가 나갔습니다. 새로운 상대를 기다려주세요.");
    delete partners[partner];
    delete partners[socket.id];

    const partnerSocket = io.sockets.sockets.get(partner);
    if (partnerSocket) {
      rejoin(partnerSocket);
    }
  }
}

function removeFromWaiting(socket) {
  const university = socket.university;

  if (university && waitingUsers[university]) {
    waitingUsers[university] = waitingUsers[university].filter((id) => id !== socket.id);
  }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});