// HomeRedirect.jsx
import Dashboard from "./OpenPages/admin/SuperAdminDashboard";
import SupportDashboard from "../pages/OpenPages/support/SupportDashboard";
import AdminDashboard from "./OpenPages/admin/AdminDashboard";

export default function HomeRedirect() {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) return null;

  if (user.role === "support") {
    return <SupportDashboard />;
  }

  if (user.role === "admin") {
    return <AdminDashboard />;
  }
    if (user.role === "superadmin") {
    return <Dashboard />;
  }

  return <div>Unauthorized</div>;
}