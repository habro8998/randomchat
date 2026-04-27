const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const waitingUsers = {};
const partners = {};
const activeUsers = {};
const blockedUsers = {};

io.on("connection", (socket) => {
  socket.on("join", ({ nickname, university, gender }) => {
    const normalizedGender = gender === "male" || gender === "female" ? gender : "";

    socket.nickname = nickname;
    socket.university = university;
    socket.gender = normalizedGender;
    activeUsers[socket.id] = {
      gender: normalizedGender,
      university,
      status: "waiting"
    };
    if (!blockedUsers[socket.id]) {
      blockedUsers[socket.id] = new Set();
    }

    matchUser(socket);
    broadcastPresenceStats();
  });

  socket.on("message", (payload) => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      const text = typeof payload === "string" ? payload : payload?.text;
      const messageId = payload?.messageId;
      if (!text) return;

      io.to(partnerId).emit("message", {
        messageId,
        text,
        senderName: socket.nickname || "익명"
      });
    }
  });

  socket.on("message_read", ({ messageId }) => {
    const partnerId = partners[socket.id];
    if (partnerId && messageId) {
      io.to(partnerId).emit("message_read", { messageId });
    }
  });

  socket.on("typing_start", () => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit("typing_start");
    }
  });

  socket.on("typing_stop", () => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit("typing_stop");
    }
  });

  socket.on("poke_send", ({ topic }) => {
    const partnerId = partners[socket.id];
    if (!partnerId || !topic) return;
    io.to(partnerId).emit("poke_received", { topic });
  });

  socket.on("location_share_request", () => {
    const partnerId = partners[socket.id];
    if (!partnerId) return;
    io.to(partnerId).emit("location_share_requested");
  });

  socket.on("location_share_response", ({ accepted, reason }) => {
    const partnerId = partners[socket.id];
    if (!partnerId) return;

    io.to(partnerId).emit("location_share_response", {
      accepted: Boolean(accepted),
      reason: reason || ""
    });
  });

  socket.on("location_share_ready", () => {
    const partnerId = partners[socket.id];
    if (!partnerId) return;
    io.to(socket.id).emit("location_share_started");
    io.to(partnerId).emit("location_share_started");
  });

  socket.on("location_update", ({ location }) => {
    const partnerId = partners[socket.id];
    if (!partnerId || !location) return;
    io.to(partnerId).emit("location_update", { location });
  });

  socket.on("location_share_stop", () => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      io.to(partnerId).emit("location_share_stopped", {
        message: "상대가 위치 공유를 종료했습니다."
      });
    }
    socket.emit("location_share_stopped", {
      message: "위치 공유가 종료되었습니다."
    });
  });

  socket.on("next", () => {
    disconnectPartner(socket);
    setUserStatus(socket.id, "waiting");
    matchUser(socket);
    broadcastPresenceStats();
  });

  socket.on("block", () => {
    const partnerId = partners[socket.id];
    if (partnerId) {
      blockedUsers[socket.id].add(partnerId);
    }

    disconnectPartner(socket, "상대가 차단되어 연결이 종료되었습니다.");
    setUserStatus(socket.id, "waiting");
    socket.emit("blocked", "차단이 완료되었습니다.");
    matchUser(socket);
    broadcastPresenceStats();
  });

  socket.on("disconnect", () => {
    removeFromWaiting(socket);
    disconnectPartner(socket);
    delete activeUsers[socket.id];
    delete blockedUsers[socket.id];
    setUserStatus(socket.id, "waiting");
    broadcastPresenceStats();
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

  const partnerId = waitingUsers[university].find((id) => {
    if (id === socket.id) return false;
    if (!io.sockets.sockets.get(id)) return false;
    if (isBlockedPair(socket.id, id)) return false;
    return true;
  });

  if (partnerId) {
    waitingUsers[university] = waitingUsers[university].filter(
      (id) => id !== partnerId
    );

    const partnerSocket = io.sockets.sockets.get(partnerId);

    partners[socket.id] = partnerId;
    partners[partnerId] = socket.id;
    setUserStatus(socket.id, "chatting");
    setUserStatus(partnerId, "chatting");

    socket.emit("matched", {
      myName: socket.nickname || "익명",
      partnerName: partnerSocket?.nickname || "익명"
    });

    io.to(partnerId).emit("matched", {
      myName: partnerSocket?.nickname || "익명",
      partnerName: socket.nickname || "익명"
    });
  } else {
    waitingUsers[university].push(socket.id);
    setUserStatus(socket.id, "waiting");
    socket.emit("waiting", "상대를 찾는 중입니다...");
  }

  broadcastPresenceStats();
}

function disconnectPartner(socket, partnerLeftMessage) {
  const partnerId = partners[socket.id];

  if (partnerId) {
    io.to(partnerId).emit("location_share_stopped", {
      message: "상대 연결 종료로 위치 공유가 중지되었습니다."
    });

    io.to(partnerId).emit(
      "partnerLeft",
      partnerLeftMessage || "상대가 나갔습니다. 새로운 상대를 찾고 있습니다."
    );

    delete partners[partnerId];
    delete partners[socket.id];

    const partnerSocket = io.sockets.sockets.get(partnerId);
    setUserStatus(partnerId, "waiting");
    setUserStatus(socket.id, "waiting");

    if (partnerSocket) {
      setTimeout(() => {
        matchUser(partnerSocket);
      }, 500);
    }
  }

  broadcastPresenceStats();
}

function removeFromWaiting(socket) {
  const university = socket.university;

  if (university && waitingUsers[university]) {
    waitingUsers[university] = waitingUsers[university].filter(
      (id) => id !== socket.id
    );
  }
}

function isBlockedPair(a, b) {
  return blockedUsers[a]?.has(b) || blockedUsers[b]?.has(a);
}

function setUserStatus(socketId, status) {
  if (activeUsers[socketId]) {
    activeUsers[socketId].status = status;
  }
}

function broadcastPresenceStats() {
  const users = Object.values(activeUsers);
  const stats = {
    total: users.length,
    male: { waiting: 0, chatting: 0 },
    female: { waiting: 0, chatting: 0 }
  };

  users.forEach((user) => {
    const target = user.gender === "male" ? stats.male : user.gender === "female" ? stats.female : null;
    if (!target) return;
    if (user.status === "chatting") {
      target.chatting += 1;
    } else {
      target.waiting += 1;
    }
  });

  io.emit("presence_stats", stats);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});