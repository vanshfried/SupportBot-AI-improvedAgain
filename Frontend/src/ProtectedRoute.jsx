import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRoles }) {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />; // 🔥 better fallback
  }

  return children;
}