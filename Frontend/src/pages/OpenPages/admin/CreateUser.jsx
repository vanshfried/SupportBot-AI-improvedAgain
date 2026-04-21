// Frontend/src/pages/OpenPages/admin/CreateUser.jsx
import { useState, useEffect } from "react";
import {
  createAdmin,
  createSupport,
  getCurrentUser,
} from "../../../API/LoginAPI";
import API from "../../../API/api";
import styles from "./styles/CreateUser.module.css";

export default function CreateUser() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department_id: "",
    country_id: "",
  });

  const [departments, setDepartments] = useState([]);
  const [countries, setCountries] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [roleToCreate, setRoleToCreate] = useState("support");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const isStrongPassword = (password) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(password);

  const showToast = (message, type = "error") => {
    setToast({ message, type });

    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  useEffect(() => {
    getCurrentUser().then((data) => {
      setCurrentUser(data);

      if (data.role === "admin") {
        setRoleToCreate("support");
        setForm((prev) => ({
          ...prev,
          department_id: data.department_id,
        }));
      }
    });
  }, []);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [depRes, countryRes] = await Promise.all([
          API.get("/meta/departments"),
          API.get("/meta/countries"),
        ]);

        setDepartments(depRes.data);
        setCountries(countryRes.data);
      } catch (err) {
        console.error("Failed to fetch meta", err);
      }
    };

    fetchMeta();
  }, []);

  const handleChange = (key, value) => {
    // trim email + name
    if (key === "email") value = value.trim().toLowerCase();
    if (key === "name") value = value.trimStart();

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isValid =
    form.name.trim() &&
    isValidEmail(form.email) &&
    isStrongPassword(form.password) &&
    form.country_id &&
    form.department_id;

  const handleSubmit = async () => {
    if (!isValid) return showToast("Please fill all required fields");

    setLoading(true);

    try {
      const res =
        roleToCreate === "admin"
          ? await createAdmin(form)
          : await createSupport(form);

      if (res?.id) {
        showToast("User created ✅", "success");

        setForm({
          name: "",
          email: "",
          password: "",
          department_id:
            currentUser?.role === "admin" ? currentUser.department_id : "",
          country_id: "",
        });
      } else {
        showToast(res?.error || "Failed", "error");
      }
    } catch (err) {
      showToast(err?.response?.data?.error || "Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {toast && (
        <div
          className={`${styles.toast} ${
            toast.type === "success" ? styles.success : styles.errorToast
          }`}
        >
          {toast.message}
        </div>
      )}
      {/* Background */}
      <div className={styles.overlay} />

      {/* Card */}
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <img
            src="/images/header-logo.png"
            alt="logo"
            className={styles.logo}
          />
          <h2>Create User</h2>
          <p className={styles.subtitle}>Add new admin or support member</p>
        </div>

        {/* Form */}
        <div className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Name</label>
            <input
              value={form.name}
              placeholder="Enter full name"
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Email</label>
            <input
              value={form.email}
              placeholder="Enter email"
              onChange={(e) => handleChange("email", e.target.value)}
            />
            {form.email && !isValidEmail(form.email) && (
              <p className={styles.error}>Invalid email format</p>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label>Password</label>
            <input
              value={form.password}
              placeholder="Enter password"
              type="password"
              onChange={(e) => handleChange("password", e.target.value)}
            />
            {form.password && !isStrongPassword(form.password) && (
              <p className={styles.error}>
                Password must be 8+ chars, include uppercase, lowercase, number
                & symbol
              </p>
            )}
          </div>

          {/* SUPERADMIN ONLY */}
          {currentUser?.role === "superadmin" && (
            <>
              <div className={styles.inputGroup}>
                <label>Role</label>
                <select
                  value={roleToCreate}
                  onChange={(e) => setRoleToCreate(e.target.value)}
                >
                  <option value="support">Support</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label>Department</label>
                <select
                  value={form.department_id}
                  onChange={(e) =>
                    handleChange("department_id", Number(e.target.value))
                  }
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* COUNTRY */}
          <div className={styles.inputGroup}>
            <label>Country</label>
            <select
              value={form.country_id}
              onChange={(e) =>
                handleChange("country_id", Number(e.target.value))
              }
            >
              <option value="">Select Country</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className={styles.button}
            disabled={!isValid || loading}
            onClick={handleSubmit}
          >
            {loading ? "Creating..." : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}
