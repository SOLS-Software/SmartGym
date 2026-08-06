'use client';

import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { ExerciseDetailDrawer } from './ExerciseDetailDrawer';
import type { ExerciseWithCover } from './registrationTypes';

type ExerciseCardProps = {
  exercise: ExerciseWithCover;
  meta?: string;
  // Sem onClick o card abre o painel de detalhe por conta propria. Passar
  // onClick substitui esse comportamento (a tela assume o clique).
  onClick?: () => void;
};

export function ExerciseCard({ exercise, meta, onClick }: ExerciseCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
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
        {exercise.equipamentos?.length > 0 ? (
          <p className="exercise-card-equipment">
            <Dumbbell size={13} />
            <span>{exercise.equipamentos.map((e) => e.nmEquipamento).filter(Boolean).join(' · ')}</span>
          </p>
        ) : null}
        {exercise.dsInstrucao ? (
          <p className="exercise-card-instruction">{exercise.dsInstrucao}</p>
        ) : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button className="exercise-card" onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  // O card inteiro e o alvo do clique. `aria-expanded` conta ao leitor de tela
  // que ele abre algo, e o painel devolve o foco para ca ao fechar (o trap de
  // foco do RegistrationDrawer cuida disso).
  return (
    <>
      <button
        aria-expanded={isDetailOpen}
        aria-label={`Ver detalhes de ${exercise.dsExercicio}`}
        className="exercise-card"
        onClick={() => setIsDetailOpen(true)}
        type="button"
      >
        {content}
      </button>
      {isDetailOpen ? (
        <ExerciseDetailDrawer
          exercise={exercise}
          isOpen={isDetailOpen}
          meta={meta}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}
    </>
  );
}
