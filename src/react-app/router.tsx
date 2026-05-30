import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PainCheckinScreen } from "./screens/PainCheckinScreen";
import { ExerciseDetailScreen } from "./screens/ExerciseDetailScreen";
import { SqueezeTestScreen } from "./screens/SqueezeTestScreen";
import { CuerpoScreen } from "./screens/CuerpoScreen";
import { PhasesOverviewScreen } from "./screens/PhasesOverviewScreen";
import { PhaseJourneyScreen } from "./screens/PhaseJourneyScreen";
import { PhaseExercisesScreen } from "./screens/PhaseExercisesScreen";
import { InjuryEditScreen } from "./screens/InjuryEditScreen";
import { PhaseEditScreen } from "./screens/PhaseEditScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { LearnArticleScreen } from "./screens/LearnArticleScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ProtectedRoute } from "./auth/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/path" replace /> },
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
      { path: "/path/injury/:id/edit", element: <InjuryEditScreen /> },
      { path: "/path/injury/:id/phase/new", element: <PhaseEditScreen /> },
      { path: "/path/phase/:id/edit", element: <PhaseEditScreen /> },
      { path: "/path/phase/:id", element: <PhaseJourneyScreen /> },
      { path: "/path/phase/:id/exercises", element: <PhaseExercisesScreen /> },
      { path: "/path/progress", element: <ProgressScreen /> },
      { path: "/learn", element: <LearnScreen /> },
      { path: "/learn/:id", element: <LearnArticleScreen /> },
      { path: "/profile", element: <ProfileScreen /> },
    ],
  },
]);
