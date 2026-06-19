import { MotionConfig } from "motion/react";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "@features/auth";
import { router } from "./router";
import { ErrorBoundary, StorageWarning } from "@shared";
import "@design/tokens.css";

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
