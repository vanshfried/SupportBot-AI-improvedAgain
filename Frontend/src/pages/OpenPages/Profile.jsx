import { useEffect, useState } from "react";
import API from "../../API/api";

export default function Profile() {
  const [data, setData] = useState(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    API.get("/profile").then((res) => {
      setData(res.data);
    });
  }, []);

  const formatTime = (sec) => {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h`;
  };

  const compare = (user, company, reverse = false) => {
    if (!company) return null;

    const better = reverse ? user < company : user > company;

    return (
      <span
        style={{
          marginLeft: 8,
          fontSize: 12,
          color: better ? "green" : "red",
        }}
      >
        {better ? "↑" : "↓"}
      </span>
    );
  };

  const changePassword = async () => {
    if (newPassword !== confirm) {
      return alert("Passwords do not match");
    }

    try {
      await API.post("/profile/change-password", {
        oldPassword,
        newPassword,
      });

      alert("Password changed ✅");

      setOldPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      alert(err.response?.data?.error || "Error");
    }
  };

  if (!data) return <div style={{ padding: 20 }}>Loading...</div>;

  const { user, company } = data;

  return (
    <div style={{ padding: "24px", background: "#f6f7fb", minHeight: "100vh" }}>
      {/* ========================= */}
      {/* 👤 MY PERFORMANCE */}
      {/* ========================= */}
      <h2 style={{ marginBottom: 16 }}>👤 My Performance</h2>

      <div style={grid}>
        <Card
          title="Messages"
          value={user.message_count}
          compareEl={compare(user.message_count, company.avg_messages)}
        />

        <Card
          title="Closed Chats"
          value={user.conversations_closed}
          compareEl={compare(user.conversations_closed, company.avg_closed)}
        />
        <Card title="Messages Received" value={user.messages_received} />

        <Card
          title="Avg Response"
          value={formatTime(user.avg_response_time)}
          compareEl={compare(
            user.avg_response_time,
            company.avg_response_time,
            true, // lower is better
          )}
        />

        <Card
          title="First Response"
          value={formatTime(user.first_response_time)}
          compareEl={compare(
            user.first_response_time,
            company.avg_first_response,
            true,
          )}
        />
      </div>

      {/* ========================= */}
      {/* 🏢 COMPANY */}
      {/* ========================= */}
      <h2 style={{ margin: "32px 0 16px" }}>🏢 Company Average</h2>

      <div style={grid}>
        <Card
          title="Avg Response"
          value={formatTime(company.avg_response_time)}
        />

        <Card
          title="First Response"
          value={formatTime(company.avg_first_response)}
        />
      </div>

      {/* ========================= */}
      {/* 🔐 PASSWORD */}
      {/* ========================= */}
      <h2 style={{ margin: "32px 0 16px" }}>🔐 Change Password</h2>

      <div style={passwordBox}>
        <input
          type="password"
          placeholder="Old Password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          style={input}
        />

        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={input}
        />

        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={input}
        />

        <button onClick={changePassword} style={button}>
          Change Password
        </button>
      </div>
    </div>
  );
}

/* ========================= */
/* 🔹 CARD COMPONENT */
/* ========================= */
function Card({ title, value, compareEl }) {
  return (
    <div
      style={{
        background: "white",
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid #eee",
        boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
      }}
    >
      <p style={{ fontSize: 14, color: "#666" }}>{title}</p>
      <h3 style={{ marginTop: 8 }}>
        {value} {compareEl}
      </h3>
    </div>
  );
}

/* ========================= */
/* 🎨 STYLES */
/* ========================= */

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "16px",
};

const passwordBox = {
  background: "white",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #eee",
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const input = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  flex: "1",
  minWidth: "200px",
};

const button = {
  padding: "10px 16px",
  borderRadius: "8px",
  border: "none",
  background: "#4f46e5",
  color: "white",
  cursor: "pointer",
};
