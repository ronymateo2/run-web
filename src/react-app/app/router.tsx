import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginScreen, ProtectedRoute } from "@features/auth";
import {
  HomeScreen,
  PainCheckinScreen,
  ExerciseDetailScreen,
  ExerciseEditScreen,
  GuidedExerciseScreen,
  SqueezeTestScreen,
  PromScreen,
} from "@features/today";
import { CuerpoScreen } from "@features/body";
import {
  PhasesOverviewScreen,
  PhaseJourneyScreen,
  PhaseExercisesScreen,
  PhaseExercisesEditScreen,
  InjuryEditScreen,
  PhaseEditScreen,
} from "@features/path";
import { LearnScreen } from "@features/learn";
import { ProfileScreen } from "@features/profile";
import { RouteErrorFallback } from "@shared";

// Lazy-loaded: pull in heavy deps (recharts, react-markdown) only when visited.
const ProgressScreen = lazy(() =>
  import("@features/path/screens/ProgressScreen").then((m) => ({ default: m.ProgressScreen })),
);
const PromDetailScreen = lazy(() =>
  import("@features/path/screens/PromDetailScreen").then((m) => ({ default: m.PromDetailScreen })),
);
const LearnArticleScreen = lazy(() =>
  import("@features/learn/screens/LearnArticleScreen").then((m) => ({ default: m.LearnArticleScreen })),
);

const lazyScreen = (el: React.ReactNode) => <Suspense fallback={null}>{el}</Suspense>;

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/path" replace /> },
  { path: "/login", element: <LoginScreen /> },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: "/today", element: <HomeScreen /> },
      { path: "/today/checkin", element: <PainCheckinScreen /> },
      { path: "/today/exercise/:id", element: <ExerciseDetailScreen /> },
      { path: "/today/exercise/:id/edit", element: <ExerciseEditScreen /> },
      { path: "/today/exercise/:id/guided", element: <GuidedExerciseScreen /> },
      { path: "/today/sst", element: <SqueezeTestScreen /> },
      { path: "/today/prom/:instrumentId", element: <PromScreen /> },
      { path: "/body", element: <CuerpoScreen /> },
      { path: "/path", element: <PhasesOverviewScreen /> },
      { path: "/path/injury/:id/edit", element: <InjuryEditScreen /> },
      { path: "/path/injury/:id/phase/new", element: <PhaseEditScreen /> },
      { path: "/path/phase/:id/edit", element: <PhaseEditScreen /> },
      { path: "/path/phase/:id", element: <PhaseJourneyScreen /> },
      { path: "/path/phase/:id/exercises", element: <PhaseExercisesScreen /> },
      { path: "/path/phase/:id/exercises/edit", element: <PhaseExercisesEditScreen /> },
      { path: "/path/progress", element: lazyScreen(<ProgressScreen />) },
      { path: "/path/prom/:instrumentId", element: lazyScreen(<PromDetailScreen />) },
      { path: "/learn", element: <LearnScreen /> },
      { path: "/learn/:id", element: lazyScreen(<LearnArticleScreen />) },
      { path: "/profile", element: <ProfileScreen /> },
    ],
  },
]);
