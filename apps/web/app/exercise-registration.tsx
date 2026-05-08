'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, formatDateInput, isImageFile, paginateItems } from './registration-helpers';
import type { Company, Exercise, ExerciseFile } from './registration-types';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

type ExerciseRegistrationProps = {
  readOnly?: boolean;
};

export function ExerciseRegistration({ readOnly = false }: ExerciseRegistrationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesPage, setExercisesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [exerciseFiles, setExerciseFiles] = useState<ExerciseFile[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [isExerciseActive, setIsExerciseActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const isFormEnabled = selectedExerciseId !== null || isCreating;
  const filteredExercises = exercises.filter((exercise) =>
    exercise.dsExercicio.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const exercisesTotalPages = Math.max(1, Math.ceil(filteredExercises.length / GRID_PAGE_SIZE));
  const paginatedExercises = paginateItems(filteredExercises, exercisesPage);

  async function loadExercises() {
    try {
      const response = await fetch(`${apiUrl}/exercises`);
      if (!response.ok) throw new Error('Não foi possível carregar os exercícios.');
      const data = (await response.json()) as Exercise[];
      setExercises(data);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios.');
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) throw new Error('Nao foi possivel carregar as empresas.');
      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  useEffect(() => {
    void loadExercises();
    void loadCompanies();
  }, []);

  useEffect(() => {
    setExercisesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (exercisesPage > exercisesTotalPages) {
      setExercisesPage(exercisesTotalPages);
    }
  }, [exercisesPage, exercisesTotalPages]);

  useEffect(() => {
    if (!selectedExerciseId) {
      setExerciseFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      return;
    }

    void loadExerciseFiles(selectedExerciseId);
  }, [selectedExerciseId]);

  async function loadExerciseFiles(exerciseId: number) {
    try {
      const response = await fetch(`${apiUrl}/exercises/${exerciseId}/files`);
      if (!response.ok) throw new Error('Não foi possível carregar os arquivos do exercício.');
      const data = (await response.json()) as ExerciseFile[];
      setExerciseFiles(data);
      setFileFeedback('');

      const imageFiles = data.filter((file) => isImageFile(file.anCaminho));
      const urlEntries = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const urlResponse = await fetch(`${apiUrl}/exercises/${exerciseId}/files/${file.id}/url`);
            if (!urlResponse.ok) return null;
            const urlData = (await urlResponse.json()) as { url: string };
            return [file.id, urlData.url] as const;
          } catch {
            return null;
          }
        }),
      );

      const urls: Record<number, string> = {};
      for (const entry of urlEntries) {
        if (entry) urls[entry[0]] = entry[1];
      }
      setPreviewUrls(urls);
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao carregar arquivos.');
    }
  }

  function clearForm() {
    setSelectedExerciseId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setExerciseName('');
    setIsExerciseActive(false);
    setFeedback('');
    setFileFeedback('');
    setExerciseFiles([]);
    setPreviewUrls({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleNewExercise() {
    clearForm();
    setIsCreating(true);
    setIsExerciseActive(true);
  }

  function handleSelectExercise(exercise: Exercise) {
    setSelectedExerciseId(exercise.id);
    setIsCreating(false);
    setSelectedCompanyId(exercise.idEmpresa ? String(exercise.idEmpresa) : '');
    setExerciseName(exercise.dsExercicio);
    setIsExerciseActive(exercise.boInativo === 0);
    setFeedback('');
    setFileFeedback('');
  }

  async function handleToggleStatus() {
    const nextActive = !isExerciseActive;
    setIsExerciseActive(nextActive);
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? 0 : 1 }),
      });

      if (!response.ok) throw new Error('Nao foi possivel alterar o status.');
      const updated = (await response.json()) as Exercise;
      setExercises((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsExerciseActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        dsExercicio: exerciseName,
        boInativo: isExerciseActive ? 0 : 1,
      };

      const response = await fetch(
        selectedExerciseId ? `${apiUrl}/exercises/${selectedExerciseId}` : `${apiUrl}/exercises`,
        {
          method: selectedExerciseId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar.');
      }

      const saved = (await response.json()) as Exercise;
      setExercises((current) => {
        if (selectedExerciseId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => a.dsExercicio.localeCompare(b.dsExercicio));
      });
      setSelectedExerciseId(saved.id);
      setIsCreating(false);
      setFeedback('Exercicio salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  async function handleUploadExerciseFile(file: File | null) {
    if (!file) return;
    if (!selectedExerciseId) {
      setFileFeedback('Salve o exercício antes de anexar arquivos.');
      return;
    }

    try {
      setIsUploadingFile(true);
      setFileFeedback('');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o arquivo.');
      }

      await loadExerciseFiles(selectedExerciseId);
      setFileFeedback('Arquivo enviado com sucesso.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleOpenExerciseFile(fileId: number) {
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/files/${fileId}/url`);
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao abrir arquivo.');
    }
  }

  async function handleRemoveExerciseFile(fileId: number) {
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }

      await loadExerciseFiles(selectedExerciseId);
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Treino</p>
        <h2>Cadastro de Exercício</h2>
        <p>Cadastre os exercícios e anexe arquivos de apoio como imagens e vídeos.</p>
      </div>

      <div className="registration-split-layout">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div>
              <p className="section-label">Exercícios</p>
              <h3>Exercícios cadastrados</h3>
            </div>
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar exercício"
                type="search"
                value={searchTerm}
              />
            </label>
            {!readOnly ? (
              <button className="new-button" onClick={handleNewExercise} type="button">
                Novo exercício
              </button>
            ) : null}
          </div>

          <div className="product-table" role="table" aria-label="Exercícios cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Exercício</span>
              <span role="columnheader">Empresa</span>
              <span role="columnheader">Status</span>
            </div>

            {paginatedExercises.map((exercise) => (
              <button
                className={`product-row selectable ${exercise.id === selectedExerciseId ? 'selected' : ''}`}
                key={exercise.id}
                onClick={() => handleSelectExercise(exercise)}
                role="row"
                type="button"
              >
                <span role="cell">{exercise.dsExercicio}</span>
                <span role="cell">
                  {companies.find((company) => company.id === exercise.idEmpresa)?.dsEmpresa ?? '-'}
                </span>
                <span role="cell">
                  <span className={`status-badge ${exercise.boInativo === 0 ? 'active' : 'inactive'}`}>
                    {exercise.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <GridPagination
            onChange={setExercisesPage}
            page={exercisesPage}
            totalItems={filteredExercises.length}
          />
        </section>

        {readOnly ? null : (
        <form className="registration-form split-form-panel" onSubmit={handleSaveExercise}>
          {!isFormEnabled ? <div className="form-hint">Selecione um exercício acima ou clique em Novo.</div> : null}
          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <div className="field">
            <label htmlFor="exerciseCompany">Empresa</label>
            <select
              disabled={!isFormEnabled}
              id="exerciseCompany"
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              value={selectedCompanyId}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.dsEmpresa}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="exerciseName">Nome do exercício</label>
            <input
              disabled={!isFormEnabled}
              id="exerciseName"
              maxLength={255}
              onChange={(event) => setExerciseName(event.target.value)}
              placeholder="Ex.: Supino reto"
              type="text"
              value={exerciseName}
            />
          </div>

          <div className="field">
            <label htmlFor="exerciseStatus">Status</label>
            <button
              aria-pressed={isExerciseActive}
              className={`status-toggle ${isExerciseActive ? 'active' : ''}`}
              disabled={!isFormEnabled}
              id="exerciseStatus"
              onClick={handleToggleStatus}
              type="button"
            >
              <span>{isExerciseActive ? 'Ativo' : 'Inativo'}</span>
            </button>
          </div>

          <div className="form-actions">
            <button className="secondary-button" disabled={!isFormEnabled} onClick={clearForm} type="button">
              Limpar
            </button>
            <button disabled={!isFormEnabled} type="submit">
              Salvar exercício
            </button>
          </div>

          <section className="student-files-section" aria-label="Arquivos do exercício">
            <div className="student-files-header">
              <h3>Arquivos do exercício</h3>
            </div>
            {!selectedExerciseId ? (
              <div className="form-hint">Salve ou selecione um exercício para anexar arquivos.</div>
            ) : null}
            {fileFeedback ? <div className="form-feedback">{fileFeedback}</div> : null}
            <div className="file-upload-controls">
              <input
                disabled={!selectedExerciseId || isUploadingFile}
                id="exerciseFile"
                onChange={(event) => {
                  const [file] = Array.from(event.target.files ?? []);
                  void handleUploadExerciseFile(file ?? null);
                }}
                ref={fileInputRef}
                type="file"
              />
            </div>

            <div className="student-files-list">
              {exerciseFiles.map((file) => (
                <div className="student-file-row" key={file.id}>
                  {previewUrls[file.id] ? (
                    <img alt={file.dsArquivo ?? file.anCaminho} className="student-file-preview" src={previewUrls[file.id]} />
                  ) : null}
                  <div className="student-file-row-info">
                    <strong>{file.dsArquivo ?? file.anCaminho.split('/').pop() ?? `Arquivo ${file.id}`}</strong>
                    <span>{file.anCaminho}</span>
                  </div>
                  <div className="student-file-actions">
                    <button className="secondary-button" onClick={() => void handleOpenExerciseFile(file.id)} type="button">
                      Visualizar
                    </button>
                    <button className="danger" onClick={() => void handleRemoveExerciseFile(file.id)} type="button">
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              {selectedExerciseId && exerciseFiles.length === 0 ? (
                <div className="empty-row">Nenhum arquivo anexado.</div>
              ) : null}
            </div>
          </section>
        </form>
        )}
      </div>
    </div>
  );
}

