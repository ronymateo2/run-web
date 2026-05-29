import { ExerciseRow } from "./ExerciseRow";
import type { Exercise, ExerciseLog } from "../../db/queries/exercises";

/** Count sets logged per exercise (each log row = one set). */
export function setsDoneMap(logs: ExerciseLog[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) m.set(l.exercise_id, (m.get(l.exercise_id) ?? 0) + 1);
  return m;
}

/** Exercises fully done = all required sets logged. */
export function countDone(exercises: Exercise[], setsDone: Map<string, number>): number {
  return exercises.filter(e => (setsDone.get(e.id) ?? 0) >= (e.sets ?? 1)).length;
}

function estimateMins(sets?: number, reps?: number, duration_s?: number): number | undefined {
  if (sets && reps) return Math.ceil((sets * reps * 4) / 60);
  if (sets && duration_s) return Math.ceil((sets * duration_s) / 60);
  return undefined;
}

interface Props {
  exercises: Exercise[];
  setsDone: Map<string, number>;
  phaseName?: string;
}

export function ExerciseList({ exercises, setsDone, phaseName }: Props) {
  return (
    <div className="col gap-10 mt-16">
      {exercises.map((e) => {
        const total = e.sets ?? 1;
        const sd = setsDone.get(e.id) ?? 0;
        return (
          <ExerciseRow
            key={e.id}
            id={e.id}
            name={e.name}
            detail={e.detail ?? undefined}
            sets={e.sets ?? undefined}
            reps={e.reps ?? undefined}
            duration_s={e.duration_s ?? undefined}
            mins={estimateMins(e.sets ?? undefined, e.reps ?? undefined, e.duration_s ?? undefined)}
            setsDone={sd}
            setsTotal={total}
            done={sd >= total}
            phase={phaseName}
          />
        );
      })}
    </div>
  );
}
