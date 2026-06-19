import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

function FullLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05080f]">
      <Loader2 className="w-8 h-8 text-[#6c63ff] animate-spin" />
    </div>
  );
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!["admin", "superadmin"].includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}
