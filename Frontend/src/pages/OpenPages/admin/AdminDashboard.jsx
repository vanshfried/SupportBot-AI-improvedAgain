import { useNavigate } from "react-router-dom";
import styles from "./styles/Dashboard.module.css";

function AdminDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  return (
    <div className={styles.container}>
      {/* TOP BAR */}
      <div className={styles.topbar}>
        <div className={styles.brand}>
          <img src="images/logo.png" className={styles.logo} />
          <span>Support Panel</span>
        </div>
      </div>

      <div className={styles.body}>
        {/* SIDEBAR */}
        <div className={styles.sidebar}>
          <div className={styles.menuItem} onClick={() => navigate("/chat")}>
            💬
            <span>Live Chat</span>
          </div>

          <div className={styles.menuItem} onClick={() => navigate("/compose")}>
            ✉️
            <span>Compose</span>
          </div>

          <div
            className={styles.menuItem}
            onClick={() => navigate("/create-user")}
          >
            👑
            <span>Create User</span>
          </div>
          <div
            className={styles.menuItem}
            onClick={() =>
              navigate(`/analytics/departments/${user.department}`)
            }
          >
            📊<span>Department Analytics</span>
          </div>
          <div className={styles.menuItem} onClick={() => navigate("/profile")}>
            👤
            <span>Profile</span>
          </div>
        </div>

        {/* MAIN */}
        <div className={styles.main}>
          <h1 className={styles.heading}>Dashboard</h1>

          <div className={styles.cards}>
            <div className={styles.card} onClick={() => navigate("/chat")}>
              <div className={styles.cardIcon}>💬</div>
              <h3>Live Chat</h3>
              <p>Handle customer conversations in real-time</p>
            </div>

            <div className={styles.card} onClick={() => navigate("/compose")}>
              <div className={styles.cardIcon}>✉️</div>
              <h3>Compose Message</h3>
              <p>Send single or bulk WhatsApp messages</p>
            </div>

            <div
              className={styles.card}
              onClick={() => navigate("/create-user")}
            >
              <div className={styles.cardIcon}>👑</div>
              <h3>Create User</h3>
              <p>Add support agents and admins</p>
            </div>

            <div
              className={styles.card}
              onClick={() =>
                navigate(`/analytics/departments/${user.department}`)
              }
            >
              <div className={styles.cardIcon}>📊</div>
              <h3>Department Analytics</h3>
              <p>View and manage department information</p>
            </div>
            <div className={styles.card} onClick={() => navigate("/profile")}>
              <div className={styles.cardIcon}>👤</div>
              <h3>Profile</h3>
              <p>View and manage your profile</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
