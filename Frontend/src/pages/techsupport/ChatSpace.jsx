import { useState, useEffect, useRef } from "react";
import styles from "./styles/ChatSpace.module.css";

import {
  sendReply,
  endSession,
  fetchConversations,
  fetchMessages,
  assignChat,
  reopenChat,
  sendAssignRequest,
  getAssignRequests,
  acceptAssignRequest,
  rejectAssignRequest,
  getEligibleUsers,
} from "../../API/ChatAPI";

function ChatSpace() {
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [assignUsers, setAssignUsers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [requests, setRequests] = useState([]);
  const [modal, setModal] = useState(null);

  // ✅ NEW: mobile view toggle
  const [isMobileView, setIsMobileView] = useState(false);

  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");

  const hasPendingRequest = requests.some(
    (r) => r.conversation_id === selectedChat?.id && r.status === "pending",
  );

  const currentUser = JSON.parse(localStorage.getItem("user"));
  const messagesEndRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadRequests = async () => {
      const data = await getAssignRequests();
      setRequests(data || []);
    };

    loadRequests();
    const interval = setInterval(loadRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000); // every 10 sec

    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 🔁 Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      const data = await fetchConversations();
      setConversations(Array.isArray(data) ? data : []);
    };

    loadConversations();
    const interval = setInterval(loadConversations, 3000);
    return () => clearInterval(interval);
  }, []);

  // 🔥 Load messages
  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);

    // ✅ NEW: open chat screen on mobile
    setIsMobileView(true);

    const data = await fetchMessages(chat.id);
    setMessages(data);
  };

  // 🧠 RULE ENGINE
  const getChatState = () => {
    if (!selectedChat) return {};

    const isMine = selectedChat.assigned_to === currentUser?.id;
    const isUnassigned = !selectedChat.assigned_to;

    const isSuperadminChat = selectedChat.assigned_role === "superadmin";

    const lastReply = selectedChat.last_agent_reply_at;
    const minutesSinceReply = lastReply
      ? Math.floor((currentTime - new Date(lastReply)) / 60000)
      : null;

    return {
      isMine,
      isUnassigned,
      isSuperadminChat,
      minutesSinceReply,

      cannotTakeover: isSuperadminChat && !isMine,

      supportCanTakeover:
        currentUser.role === "support" &&
        selectedChat.assigned_to &&
        !isMine &&
        minutesSinceReply >= 20,

      canReply:
        !isEnded && (isUnassigned || isMine || currentUser.role !== "support"),

      disableAssign: isSuperadminChat && !isMine,
    };
  };

  const isEnded = selectedChat?.status === "ended";
  const chatState = getChatState();

  const openModal = (text, action) => {
    setModal({ text, action });
  };

  const closeModal = () => setModal(null);

  const handleSendReply = async (force = false) => {
    console.log("📤 Sending:", {
      to: selectedChat.sender_id,
      message,
      files,
      force,
    });

    if (!message.trim() && files.length === 0) return;

    try {
      const formData = new FormData();
      formData.append("to", selectedChat.sender_id);
      formData.append("message", message);

      files.forEach((f) => {
        formData.append("files", f);
      });

      await sendReply(formData, force);

      setMessage("");
      setFiles([]);

      const data = await fetchMessages(selectedChat.id);
      setMessages(data);
    } catch (error) {
      console.error("❌ Send error:", error);

      const backendMsg =
        error?.response?.data?.error || error?.message || "Unknown error";

      alert(`❌ ${backendMsg}`);

      if (error?.response?.data?.error?.includes("active")) {
        openModal(`Take over chat from ${selectedChat.assigned_role}?`, () =>
          handleSendReply(true),
        );
      }
    }
  };

  const handleAssign = async () => {
    if (!selectedChat) return;

    const isAssigned = selectedChat.assigned_to;

    if (chatState.cannotTakeover) {
      openModal("❌ Cannot take over a Superadmin chat");
      return;
    }

    if (isAssigned && !chatState.isMine) {
      openModal(
        `Take over chat from ${selectedChat.assigned_role}?`,
        async () => {
          await assignChat(selectedChat.id);
        },
      );
      return;
    }

    await assignChat(selectedChat.id);
  };

  const handleEnd = () => {
    openModal("⚠️ Are you sure you want to END this chat?", async () => {
      await endSession(selectedChat.id);
    });
  };

  const handleReopen = () => {
    openModal("Reopen this chat?", async () => {
      await reopenChat(selectedChat.id);
    });
  };
  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].screenX;

    if (touchEndX.current - touchStartX.current > 100) {
      setIsMobileView(false);
    }
  };

  const handleRequestAssign = async () => {
    if (!selectedChat) return;

    const users = await getEligibleUsers(selectedChat.id);
    setAssignUsers(users);
    setShowAssignModal(true);
  };

  const handleSelectUser = async (userId) => {
    try {
      setUiError("");
      setUiSuccess("");

      await sendAssignRequest(selectedChat.id, userId);

      setShowAssignModal(false);

      // ✅ instant UI feedback
      setUiSuccess("Request sent successfully");

      // optional instant state update
      setRequests((prev) => [
        ...prev,
        {
          conversation_id: selectedChat.id,
          status: "pending",
        },
      ]);
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to send request";

      setUiError(msg);
    }
  };

  const handleAccept = async (id) => {
    try {
      setUiError("");
      setUiSuccess("");

      await acceptAssignRequest(id);

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "accepted" } : r)),
      );

      setUiSuccess("Request accepted");
    } catch (err) {
      setUiError(err.response?.data?.error || "Accept failed");
    }
  };

  const handleReject = async (id) => {
    try {
      setUiError("");
      setUiSuccess("");

      await rejectAssignRequest(id);

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "rejected" } : r)),
      );

      setUiSuccess("Request rejected");
    } catch (err) {
      setUiError(err.response?.data?.error || "Reject failed");
    }
  };
  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div
        className={`${styles.sidebar} ${
          isMobileView ? styles.hideSidebar : ""
        }`}
      >
        <div className={styles.sidebarHeader}>
          <img src="images/logo.png" className={styles.logo} />
          <h3>Conversations</h3>
        </div>

        {conversations.map((chat) => {
          const isOwnedByOther =
            chat.assigned_to && chat.assigned_to !== currentUser?.id;

          return (
            <div
              key={chat.id}
              className={`${styles.userItem} ${
                selectedChat?.id === chat.id ? styles.activeUser : ""
              } ${isOwnedByOther ? styles.lockedChat : ""}`}
              onClick={() => handleSelectChat(chat)}
            >
              <div>
                {chat.sender_id}

                {chat.unread && <span className={styles.unreadDot}></span>}

                {chat.assigned_role && (
                  <small className={styles.roleTag}>{chat.assigned_role}</small>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat */}
      <div
        className={`${styles.chat} ${isMobileView ? styles.chatActive : ""}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.chatHeader}>
          {selectedChat ? (
            <>
              {/* ✅ NEW: Back button (mobile only) */}
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <button
                  className={styles.backBtn}
                  onClick={() => setIsMobileView(false)}
                >
                  ←
                </button>

                <h3>{selectedChat.sender_id}</h3>
              </div>

              <div className={styles.metaInfo}>
                {selectedChat.assigned_to &&
                  selectedChat.assigned_role === "support" &&
                  !chatState.isMine && (
                    <span className={styles.timer}>
                      ⏱️ {chatState.minutesSinceReply ?? 0} min since last reply
                    </span>
                  )}
                <span className={styles.deptBadge}>
                  Dept: {selectedChat.department_id}
                </span>

                {selectedChat.assigned_to ? (
                  <span className={styles.assignedBadge}>
                    {selectedChat.assigned_role}
                  </span>
                ) : (
                  <span className={styles.unassigned}>Unassigned</span>
                )}
              </div>
            </>
          ) : (
            <h3>Select conversation</h3>
          )}
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((msg, index) => {
            const isAgent = msg.direction === "outgoing";

            return (
              <div
                key={index}
                className={isAgent ? styles.agentWrapper : styles.userWrapper}
              >
                <div
                  className={isAgent ? styles.agentMessage : styles.userMessage}
                >
                  {/* TEXT */}
                  {/* TEXT */}
                  {msg.text && <div>{msg.text}</div>}

                  {/* IMAGE */}
                  {msg.media_type === "image" && msg.media_id && (
                    <img
                      src={`${import.meta.env.VITE_BACKEND_URL}/webhook/media/${msg.media_id}`}
                      alt="media"
                      style={{
                        maxWidth: "200px",
                        borderRadius: "8px",
                        marginTop: "5px",
                      }}
                    />
                  )}

                  {/* VIDEO */}
                  {msg.media_type === "video" && msg.media_id && (
                    <video controls width="200" style={{ marginTop: "5px" }}>
                      <source
                        src={`${import.meta.env.VITE_BACKEND_URL}/webhook/media/${msg.media_id}`}
                      />
                    </video>
                  )}

                  {/* AUDIO */}
                  {msg.media_type === "audio" && msg.media_id && (
                    <audio controls style={{ marginTop: "5px" }}>
                      <source
                        src={`${import.meta.env.VITE_BACKEND_URL}/webhook/media/${msg.media_id}`}
                      />
                    </audio>
                  )}

                  {/* DOCUMENT */}
                  {msg.media_type === "document" && msg.media_id && (
                    <a
                      href={`${import.meta.env.VITE_BACKEND_URL}/webhook/media/${msg.media_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block", marginTop: "5px" }}
                    >
                      📄 Download File
                    </a>
                  )}

                  {/* STATUS */}
                  {isAgent && (
                    <span className={styles.status}>
                      {msg.status === "sent" && "✓"}
                      {msg.status === "delivered" && "✓✓"}
                      {msg.status === "read" && (
                        <span style={{ color: "#53bdeb" }}>✓✓</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Warning */}
        {chatState.cannotTakeover && (
          <div className={styles.warning}>
            🚫 Superadmin chat cannot be taken over
          </div>
        )}
        {selectedChat && chatState.isBlocked && (
          <div className={styles.warning}>
            ⚠️ Chat handled by {selectedChat.assigned_role}
          </div>
        )}
        {uiError && <div className={styles.errorBox}>{uiError}</div>}

        {uiSuccess && <div className={styles.successBox}>{uiSuccess}</div>}

        {/* Actions */}
        <div className={styles.actions}>
          <button onClick={handleAssign} disabled={chatState.disableAssign}>
            Assign
          </button>

          <button
            onClick={handleRequestAssign}
            disabled={!chatState.isMine || hasPendingRequest}
          >
            {hasPendingRequest ? "Request Sent" : "Transfer"}
          </button>

          <button
            onClick={handleReopen}
            disabled={!isEnded || chatState.disableAll}
          >
            Reopen
          </button>

          <button
            onClick={handleEnd}
            disabled={isEnded || chatState.disableAll}
          >
            End
          </button>
        </div>

        {/* Input */}
        <div className={styles.inputBox}>
          <input
            className={styles.input}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!chatState.canReply}
            placeholder="Type a message..."
          />

          {/* 📎 FILE INPUT */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => {
              const selectedFiles = Array.from(e.target.files);

              if (selectedFiles.length > 5) {
                alert("Max 5 files allowed");
                return;
              }

              for (let f of selectedFiles) {
                if (f.size > 100 * 1024 * 1024) {
                  alert(`${f.name} is too large`);
                  return;
                }
              }

              setFiles(selectedFiles);
            }}
          />

          {files.length > 0 && (
            <div style={{ fontSize: "12px" }}>
              📎 {files.map((f) => f.name).join(", ")}
            </div>
          )}

          <button
            className={styles.sendBtn}
            onClick={() => handleSendReply()}
            disabled={!chatState.canReply}
          >
            Send
          </button>
        </div>
      </div>
      {requests.filter((r) => r.status === "pending").length > 0 && (
        <div className={styles.requestPanel}>
          <div className={styles.requestHeader}>Transfer Requests</div>

          {requests
            .filter((r) => r.status === "pending")
            .map((r) => (
              <div key={r.id} className={styles.requestCard}>
                <div className={styles.requestInfo}>
                  <div className={styles.requestTitle}>Incoming Transfer</div>

                  <div className={styles.requestMeta}>
                    <div className={styles.requestEmail}>
                      {r.from_email || "unknown@email"}
                    </div>

                    <div className={styles.requestRole}>{r.from_role}</div>
                  </div>
                </div>

                <div className={styles.requestActions}>
                  <button
                    className={styles.acceptBtn}
                    onClick={() => handleAccept(r.id)}
                  >
                    Accept
                  </button>

                  <button
                    className={styles.rejectBtn}
                    onClick={() => handleReject(r.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      {/* 🔥 MODAL */}
      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <p>{modal.text}</p>
            <div className={styles.modalActions}>
              <button
                onClick={() => {
                  modal.action();
                  closeModal();
                }}
              >
                Confirm
              </button>
              <button onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showAssignModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <h3>Select User</h3>

            {assignUsers.map((u) => (
              <div key={u.id} style={{ margin: "5px 0" }}>
                <button onClick={() => handleSelectUser(u.id)}>
                  {u.name} ({u.role})
                </button>
              </div>
            ))}

            <button onClick={() => setShowAssignModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatSpace;
