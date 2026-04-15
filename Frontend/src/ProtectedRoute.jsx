// Frontend/src/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRoles }) {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    return <Navigate to="/login" />;
  }

  // 🔥 role check
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/chat" />;
  }

  return children;
}