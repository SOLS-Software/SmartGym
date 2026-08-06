'use client';

import { Dumbbell } from 'lucide-react';
import { parseExerciseInstruction } from '@smartgym/shared';
import { RegistrationDrawer } from './RegistrationDrawer';
import type { ExerciseWithCover } from './registrationTypes';

type ExerciseDetailDrawerProps = {
  exercise: ExerciseWithCover;
  meta?: string;
  isOpen: boolean;
  onClose: () => void;
};

export function ExerciseDetailDrawer({ exercise, meta, isOpen, onClose }: ExerciseDetailDrawerProps) {
  const { descricao, passos } = parseExerciseInstruction(exercise.dsInstrucao);
  const equipamentos = exercise.equipamentos ?? [];

  return (
    <RegistrationDrawer isOpen={isOpen} onClose={onClose} title={exercise.dsExercicio}>
      <div className="exercise-detail">
        <div className={`exercise-detail-photo${exercise.coverImageUrl ? '' : ' is-empty'}`}>
          {exercise.coverImageUrl ? (
            <img alt={exercise.dsExercicio} src={exercise.coverImageUrl} />
          ) : (
            <Dumbbell size={28} />
          )}
        </div>

        <div className="exercise-detail-content">
          <h3 className="exercise-detail-name">{exercise.dsExercicio}</h3>
          {meta ? <p className="exercise-detail-meta">{meta}</p> : null}

          {exercise.areas?.length > 0 ? (
            <div className="exercise-card-areas">
              {exercise.areas.map((area) => (
                <span className="exercise-card-area-tag" key={area.id}>
                  {area.dsAreaCorporal}
                </span>
              ))}
            </div>
          ) : null}

          {descricao ? <p className="exercise-detail-description">{descricao}</p> : null}

          {passos.length > 0 ? (
            <section className="exercise-detail-section">
              <p className="section-label">Como executar</p>
              <ol className="exercise-detail-steps">
                {passos.map((passo, indice) => (
                  <li key={indice}>{passo}</li>
                ))}
              </ol>
            </section>
          ) : null}

          {equipamentos.length > 0 ? (
            <section className="exercise-detail-section">
              <p className="section-label">Equipamentos</p>
              <ul className="exercise-detail-equipment">
                {equipamentos.map((equipamento) => (
                  <li key={equipamento.id}>
                    <Dumbbell size={14} />
                    <span>{equipamento.nmEquipamento ?? 'Equipamento'}</span>
                    {equipamento.dsEquipamento ? <small>{equipamento.dsEquipamento}</small> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!descricao && passos.length === 0 ? (
            <p className="exercise-detail-empty">Este exercício ainda não tem instruções cadastradas.</p>
          ) : null}
        </div>
      </div>
    </RegistrationDrawer>
  );
}
