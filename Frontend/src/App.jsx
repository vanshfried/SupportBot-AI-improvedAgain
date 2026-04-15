import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ChatSpace from "./pages/techsupport/ChatSpace";
import Login from "./pages/OpenPages/Login";
import CreateUser from "./pages/OpenPages/admin/CreateUser";
import ProtectedRoute from "./ProtectedRoute";
import Dashboard from "./pages/OpenPages/admin/Dashboard";
import Compose from "./pages/techsupport/Compose";
import AnalyticsArea from "./pages/OpenPages/admin/analytics";
import DepartmentDetails from "./pages/OpenPages/admin/DepartmentDetails";
import Profile from "./pages/OpenPages/Profile";
function App() {
  return (
    <Router>
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* DASHBOARD → admin + superadmin */}
        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* CREATE USER → admin + superadmin */}
        <Route
          path="/create-user"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <CreateUser />
            </ProtectedRoute>
          }
        />

        {/* CHAT → ALL */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute allowedRoles={["support", "admin", "superadmin"]}>
              <ChatSpace />
            </ProtectedRoute>
          }
        />
        {/* COMPOSE → ALL */}
        <Route
          path="/compose"
          element={
            <ProtectedRoute allowedRoles={["support", "admin", "superadmin"]}>
              <Compose />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={["support", "admin", "superadmin"]}>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <AnalyticsArea />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics/departments/:name"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <DepartmentDetails />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
