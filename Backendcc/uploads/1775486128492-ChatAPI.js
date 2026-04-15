// Frontend/src/API/ChatAPI.js
import API from "./api";

/* ========================
   SEND AGENT MESSAGE
======================== */
export const sendReply = async (data, force = false) => {
  if (data instanceof FormData) {
    data.append("force", force ? "1" : "0");
    const res = await API.post("/agent/reply", data);
    return res.data;
  }

  const res = await API.post("/agent/reply", data);
  return res.data;
};
/* ========================
   END CHAT
======================== */
export const endSession = async (conversation_id) => {
  const res = await API.post("/agent/end", {
    conversation_id,
  });

  return res.data;
};

/* ========================
   ASSIGN CHAT
======================== */
export const assignChat = async (conversation_id, force = false) => {
  const res = await API.post("/agent/assign", {
    conversation_id,
    force, // 🔥 added here
  });

  return res.data;
};

/* ========================
   REOPEN CHAT
======================== */
export const reopenChat = async (conversation_id) => {
  const res = await API.post("/agent/reopen", {
    conversation_id,
  });

  return res.data;
};

/* ========================
   FETCH CONVERSATIONS
======================== */
export const fetchConversations = async () => {
  const res = await API.get("/webhook/conversations");
  return res.data;
};

/* ========================
   FETCH MESSAGES
======================== */
export const fetchMessages = async (conversation_id) => {
  const res = await API.get(
    `/webhook/conversations/${conversation_id}/messages`,
  );

  return res.data;
};
