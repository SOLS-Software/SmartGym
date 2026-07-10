'use client';

import { Dumbbell } from 'lucide-react';
import type { ExerciseWithCover } from './registrationTypes';

type ExerciseCardProps = {
  exercise: ExerciseWithCover;
  meta?: string;
  onClick?: () => void;
};

export function ExerciseCard({ exercise, meta, onClick }: ExerciseCardProps) {
  const content = (
    <>
      <div className="exercise-card-photo">
        {exercise.coverImageUrl ? (
          <img alt={exercise.dsExercicio} src={exercise.coverImageUrl} />
        ) : (
          <div className="exercise-card-photo-placeholder">
            <Dumbbell size={28} />
          </div>
        )}
      </div>
      <div className="exercise-card-body">
        <strong className="exercise-card-name">{exercise.dsExercicio}</strong>
        {meta ? <span className="exercise-card-meta">{meta}</span> : null}
      </div>
    </>
  );

  if (!onClick) {
    return <div className="exercise-card">{content}</div>;
  }

  return (
    <button className="exercise-card" onClick={onClick} type="button">
      {content}
    </button>
  );
}
