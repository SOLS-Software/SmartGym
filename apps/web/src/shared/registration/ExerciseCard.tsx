'use client';

import { Dumbbell } from 'lucide-react';
import type { ExerciseWithCover } from './registrationTypes';

type ExerciseCardProps = {
  exercise: ExerciseWithCover;
  meta?: string;
  onClick?: () => void;
};

export function ExerciseCard({ exercise, meta, onClick }: ExerciseCardProps) {
  // Sem capa o card virava uma caixa de ~190px com 85% de placeholder cinza
  // identico ao dos vizinhos. Numa base sem foto nenhuma isso vira um mural de
  // retangulos iguais (86 exercicios = ~8000px de rolagem) onde so a busca
  // ajuda a achar algo. Sem capa a faixa da foto encolhe para uma tarja fina
  // com o icone; com capa o card continua exatamente como era.
  const hasCover = Boolean(exercise.coverImageUrl);
  const content = (
    <>
      <div className={`exercise-card-photo${hasCover ? '' : ' is-empty'}`}>
        {hasCover ? (
          <img alt={exercise.dsExercicio} src={exercise.coverImageUrl!} />
        ) : (
          <div className="exercise-card-photo-placeholder">
            <Dumbbell size={16} />
          </div>
        )}
      </div>
      <div className="exercise-card-body">
        <strong className="exercise-card-name">{exercise.dsExercicio}</strong>
        {meta ? <span className="exercise-card-meta">{meta}</span> : null}
        {exercise.areas?.length > 0 ? (
          <div className="exercise-card-areas">
            {exercise.areas.map((area) => (
              <span className="exercise-card-area-tag" key={area.id}>
                {area.dsAreaCorporal}
              </span>
            ))}
          </div>
        ) : null}
        {exercise.dsInstrucao ? (
          <p className="exercise-card-instruction">{exercise.dsInstrucao}</p>
        ) : null}
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
