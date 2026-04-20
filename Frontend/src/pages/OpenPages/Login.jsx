import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../API/LoginAPI";
import styles from "./styles/Login.module.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const handleLogin = async () => {
    setError("");

    const res = await loginUser({ email, password });

    if (res.success) {
      localStorage.setItem("user", JSON.stringify(res.user));
      navigate("/");
    } else {
      setError(res.error || "Login failed");
    }
  };

  return (
    <div className={styles.page}>
      {/* TOP BAR */}
      <div className={styles.topBar}>
        <div className={styles.topLogo}></div>
        {/* Put your header logo inside topLogo */}
      </div>

      {/* CENTER LOGIN CARD */}
      <div className={styles.center}>
        <div className={styles.card}>
          {/* GREEN PANEL */}
          <div className={styles.left}>
            <div>
              <p className={styles.get_login}>GET</p> at <br />a Glance
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className={styles.right}>
            {/* LOGO */}
            <div className={styles.logo}></div>

            {/* SUB TEXT */}
            <div className={styles.subText}>Access the support system</div>

            {/* EMAIL */}
            <div className={styles.label}>Email</div>
            <input
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {/* PASSWORD */}
            <div className={styles.label}>Password</div>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {/* LOGIN BUTTON */}
            {error && <div className={styles.error}>{error}</div>}
            <button className={styles.button} onClick={handleLogin}>
              LOGIN
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className={styles.footer}>
        <div className={styles.links}>
          <span>Contact Us</span>
          <span>About Us</span>
          <span>Our Services</span>
        </div>

        <div className={styles.links}>
          <span>Privacy Policy</span>
          <span>Terms and Conditions</span>
        </div>

        <div className={styles.copyright}>
          © 2023 GET Global Group. All Rights Reserved.
        </div>
      </div>
    </div>
  );
}
