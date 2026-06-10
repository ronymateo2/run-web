import { MotionConfig } from "motion/react";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { router } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { StorageWarning } from "./components/StorageWarning";
import "./design/tokens.css";

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <StorageWarning />
          <RouterProvider router={router} />
        </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
