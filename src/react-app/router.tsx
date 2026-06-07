import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PainCheckinScreen } from "./screens/PainCheckinScreen";
import { ExerciseDetailScreen } from "./screens/ExerciseDetailScreen";
import { ExerciseEditScreen } from "./screens/ExerciseEditScreen";
import { SqueezeTestScreen } from "./screens/SqueezeTestScreen";
import { PromScreen } from "./screens/PromScreen";
import { CuerpoScreen } from "./screens/CuerpoScreen";
import { PhasesOverviewScreen } from "./screens/PhasesOverviewScreen";
import { PhaseJourneyScreen } from "./screens/PhaseJourneyScreen";
import { PhaseExercisesScreen } from "./screens/PhaseExercisesScreen";
import { InjuryEditScreen } from "./screens/InjuryEditScreen";
import { PhaseEditScreen } from "./screens/PhaseEditScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ProtectedRoute } from "./auth/ProtectedRoute";

// Lazy-loaded: pull in heavy deps (recharts, react-markdown) only when visited.
const ProgressScreen = lazy(() =>
  import("./screens/ProgressScreen").then((m) => ({ default: m.ProgressScreen })),
);
const LearnArticleScreen = lazy(() =>
  import("./screens/LearnArticleScreen").then((m) => ({ default: m.LearnArticleScreen })),
);

const lazyScreen = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>;

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/path" replace /> },
  { path: "/login", element: <LoginScreen /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/today", element: <HomeScreen /> },
      { path: "/today/checkin", element: <PainCheckinScreen /> },
      { path: "/today/exercise/:id", element: <ExerciseDetailScreen /> },
      { path: "/today/exercise/:id/edit", element: <ExerciseEditScreen /> },
      { path: "/today/sst", element: <SqueezeTestScreen /> },
      { path: "/today/prom/:instrumentId", element: <PromScreen /> },
      { path: "/body", element: <CuerpoScreen /> },
      { path: "/path", element: <PhasesOverviewScreen /> },
      { path: "/path/injury/:id/edit", element: <InjuryEditScreen /> },
      { path: "/path/injury/:id/phase/new", element: <PhaseEditScreen /> },
      { path: "/path/phase/:id/edit", element: <PhaseEditScreen /> },
      { path: "/path/phase/:id", element: <PhaseJourneyScreen /> },
      { path: "/path/phase/:id/exercises", element: <PhaseExercisesScreen /> },
      { path: "/path/progress", element: lazyScreen(<ProgressScreen />) },
      { path: "/learn", element: <LearnScreen /> },
      { path: "/learn/:id", element: lazyScreen(<LearnArticleScreen />) },
      { path: "/profile", element: <ProfileScreen /> },
    ],
  },
]);
