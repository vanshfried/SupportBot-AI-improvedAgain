import API from "./api";

/* 🔐 LOGIN */
export const loginUser = async (data) => {
  const res = await API.post("/auth/login", data);
  return res.data;
};

/* 👤 CURRENT USER */
export const getCurrentUser = async () => {
  const res = await API.get("/auth/me");
  return res.data;
};

/* 🚪 LOGOUT */
export const logoutUser = async () => {
  const res = await API.post("/auth/logout");
  return res.data;
};

/* ➕ CREATE ADMIN */
export const createAdmin = async (data) => {
  const res = await API.post("/superadmin/create-admin", data);
  return res.data;
};

/* ➕ CREATE SUPPORT */
export const createSupport = async (data) => {
  const res = await API.post("/superadmin/create-support", data);
  return res.data;
};
