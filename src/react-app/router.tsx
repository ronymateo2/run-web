import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PainCheckinScreen } from "./screens/PainCheckinScreen";
import { ExerciseDetailScreen } from "./screens/ExerciseDetailScreen";
import { SqueezeTestScreen } from "./screens/SqueezeTestScreen";
import { CuerpoScreen } from "./screens/CuerpoScreen";
import { PhasesOverviewScreen } from "./screens/PhasesOverviewScreen";
import { PhaseJourneyScreen } from "./screens/PhaseJourneyScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ProtectedRoute } from "./auth/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/today" replace /> },
  { path: "/login", element: <LoginScreen /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/today", element: <HomeScreen /> },
      { path: "/today/checkin", element: <PainCheckinScreen /> },
      { path: "/today/exercise/:id", element: <ExerciseDetailScreen /> },
      { path: "/today/sst", element: <SqueezeTestScreen /> },
      { path: "/body", element: <CuerpoScreen /> },
      { path: "/path", element: <PhasesOverviewScreen /> },
      { path: "/path/phase/:id", element: <PhaseJourneyScreen /> },
      { path: "/path/progress", element: <ProgressScreen /> },
      { path: "/learn", element: <LearnScreen /> },
      { path: "/profile", element: <ProfileScreen /> },
    ],
  },
]);
