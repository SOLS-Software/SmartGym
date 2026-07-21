'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, GridPagination, isImageFile, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import type { AreaCorporal, Company, Equipamento, Exercise, ExerciseFile, ExercicioAreaCorporal, ExercicioEquipamento } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

type ExerciseRegistrationProps = {
  readOnly?: boolean;
};

export function ExerciseRegistration({ readOnly = false }: ExerciseRegistrationProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exerciseNameInputRef = useRef<HTMLInputElement | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesPage, setExercisesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [exerciseFiles, setExerciseFiles] = useState<ExerciseFile[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [equipmentOptions, setEquipmentOptions] = useState<Equipamento[]>([]);
  const [exerciseEquipment, setExerciseEquipment] = useState<ExercicioEquipamento[]>([]);
  const [selectedEquipmentToAdd, setSelectedEquipmentToAdd] = useState('');
  const [isSavingEquipment, setIsSavingEquipment] = useState(false);
  const [equipmentFeedback, setEquipmentFeedback] = useState('');
  const [areaOptions, setAreaOptions] = useState<AreaCorporal[]>([]);
  const [exerciseAreas, setExerciseAreas] = useState<ExercicioAreaCorporal[]>([]);
  const [selectedAreaToAdd, setSelectedAreaToAdd] = useState('');
  const [isSavingArea, setIsSavingArea] = useState(false);
  const [areaFeedback, setAreaFeedback] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseInstructions, setExerciseInstructions] = useState('');
  const [isExerciseActive, setIsExerciseActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = selectedExerciseId !== null || isCreating;

  const filteredExercises = exercises.filter((exercise) =>
    exercise.dsExercicio.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const exercisesTotalPages = Math.max(1, Math.ceil(filteredExercises.length / GRID_PAGE_SIZE));
  const paginatedExercises = paginateItems(filteredExercises, exercisesPage);

  const getCompanyLabel = (companyId: number | null) =>
    companies.find((c) => c.id === companyId)?.dsEmpresa ?? '-';

  async function loadExercises() {
    try {
      const response = await fetch(`${apiUrl}/exercises`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os exercícios.');
      setExercises((await response.json()) as Exercise[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar exercícios.');
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as empresas.');
      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === false));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  async function loadExerciseFiles(exerciseId: number) {
    try {
      const response = await fetch(`${apiUrl}/exercises/${exerciseId}/files`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os arquivos.');
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

  async function loadEquipmentOptions() {
    try {
      const response = await fetch(`${apiUrl}/equipments`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os equipamentos.');
      const data = (await response.json()) as Equipamento[];
      setEquipmentOptions(data.filter((equipment) => equipment.boInativo === false));
    } catch (error) {
      setEquipmentFeedback(error instanceof Error ? error.message : 'Erro ao carregar equipamentos.');
    }
  }

  async function loadExerciseEquipment(exerciseId: number) {
    try {
      const response = await fetch(`${apiUrl}/exercises/${exerciseId}/equipment`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os equipamentos do exercício.');
      setExerciseEquipment((await response.json()) as ExercicioEquipamento[]);
      setEquipmentFeedback('');
    } catch (error) {
      setEquipmentFeedback(error instanceof Error ? error.message : 'Erro ao carregar equipamentos.');
    }
  }

  async function loadAreaOptions() {
    try {
      const response = await fetch(`${apiUrl}/body-areas`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as áreas do corpo.');
      const data = (await response.json()) as AreaCorporal[];
      setAreaOptions(data.filter((area) => area.boInativo === false));
    } catch (error) {
      setAreaFeedback(error instanceof Error ? error.message : 'Erro ao carregar áreas do corpo.');
    }
  }

  async function loadExerciseAreas(exerciseId: number) {
    try {
      const response = await fetch(`${apiUrl}/exercises/${exerciseId}/areas`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as áreas do exercício.');
      setExerciseAreas((await response.json()) as ExercicioAreaCorporal[]);
      setAreaFeedback('');
    } catch (error) {
      setAreaFeedback(error instanceof Error ? error.message : 'Erro ao carregar áreas do exercício.');
    }
  }

  useEffect(() => {
    void loadExercises();
    void loadCompanies();
    void loadEquipmentOptions();
    void loadAreaOptions();
  }, []);

  useEffect(() => {
    setExercisesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (exercisesPage > exercisesTotalPages) setExercisesPage(exercisesTotalPages);
  }, [exercisesPage, exercisesTotalPages]);

  useEffect(() => {
    if (!selectedExerciseId) {
      setExerciseFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      setExerciseEquipment([]);
      setEquipmentFeedback('');
      setExerciseAreas([]);
      setAreaFeedback('');
      return;
    }
    void loadExerciseFiles(selectedExerciseId);
    void loadExerciseEquipment(selectedExerciseId);
    void loadExerciseAreas(selectedExerciseId);
  }, [selectedExerciseId]);

  function clearForm() {
    setSelectedExerciseId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setExerciseName('');
    setExerciseInstructions('');
    setIsExerciseActive(false);
    setFeedback('');
    setFileFeedback('');
    setExerciseFiles([]);
    setPreviewUrls({});
    setExerciseEquipment([]);
    setSelectedEquipmentToAdd('');
    setEquipmentFeedback('');
    setExerciseAreas([]);
    setSelectedAreaToAdd('');
    setAreaFeedback('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleNewExercise() {
    clearForm();
    setIsCreating(true);
    setIsExerciseActive(true);
    setIsDrawerOpen(true);
    setTimeout(() => exerciseNameInputRef.current?.focus(), 100);
  }

  function handleEditExercise(exercise: Exercise) {
    setSelectedExerciseId(exercise.id);
    setIsCreating(false);
    setSelectedCompanyId(exercise.idEmpresa ? String(exercise.idEmpresa) : '');
    setExerciseName(exercise.dsExercicio);
    setExerciseInstructions(exercise.dsInstrucao ?? '');
    setIsExerciseActive(exercise.boInativo === false);
    setFeedback('');
    setFileFeedback('');
    setIsDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setIsDrawerOpen(false);
  }

  async function handleToggleStatus() {
    const nextActive = !isExerciseActive;
    setIsExerciseActive(nextActive);
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
      });

      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
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
        dsInstrucao: exerciseInstructions.trim() || null,
        boInativo: isExerciseActive ? false : true,
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
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Exercise;
      setExercises((current) => {
        if (selectedExerciseId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => a.dsExercicio.localeCompare(b.dsExercicio));
      });
      setSelectedExerciseId(saved.id);
      setIsCreating(false);
      showToast('Exercício salvo com sucesso.');
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
        throw new Error(errorBody.message ?? 'Não foi possível enviar o arquivo.');
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
        throw new Error(errorBody.message ?? 'Não foi possível abrir o arquivo.');
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
        throw new Error(errorBody.message ?? 'Não foi possível remover o arquivo.');
      }

      await loadExerciseFiles(selectedExerciseId);
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  async function handleAddExerciseEquipment() {
    if (!selectedExerciseId || !selectedEquipmentToAdd) return;

    try {
      setIsSavingEquipment(true);
      setEquipmentFeedback('');

      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idEquipamento: Number(selectedEquipmentToAdd) }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível vincular o equipamento.');
      }

      setSelectedEquipmentToAdd('');
      await loadExerciseEquipment(selectedExerciseId);
      setEquipmentFeedback('Equipamento vinculado com sucesso.');
    } catch (error) {
      setEquipmentFeedback(error instanceof Error ? error.message : 'Erro ao vincular equipamento.');
    } finally {
      setIsSavingEquipment(false);
    }
  }

  async function handleRemoveExerciseEquipment(linkId: number) {
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/equipment/${linkId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover o equipamento.');
      }

      await loadExerciseEquipment(selectedExerciseId);
      setEquipmentFeedback('Equipamento removido.');
    } catch (error) {
      setEquipmentFeedback(error instanceof Error ? error.message : 'Erro ao remover equipamento.');
    }
  }

  async function handleAddExerciseArea() {
    if (!selectedExerciseId || !selectedAreaToAdd) return;

    try {
      setIsSavingArea(true);
      setAreaFeedback('');

      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAreaCorporal: Number(selectedAreaToAdd) }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível vincular a área.');
      }

      setSelectedAreaToAdd('');
      await loadExerciseAreas(selectedExerciseId);
      setAreaFeedback('Área vinculada com sucesso.');
    } catch (error) {
      setAreaFeedback(error instanceof Error ? error.message : 'Erro ao vincular área.');
    } finally {
      setIsSavingArea(false);
    }
  }

  async function handleRemoveExerciseArea(linkId: number) {
    if (!selectedExerciseId) return;

    try {
      const response = await fetch(`${apiUrl}/exercises/${selectedExerciseId}/areas/${linkId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover a área.');
      }

      await loadExerciseAreas(selectedExerciseId);
      setAreaFeedback('Área removida.');
    } catch (error) {
      setAreaFeedback(error instanceof Error ? error.message : 'Erro ao remover área.');
    }
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Treino</p>
      <h2 className="module-page-title">CADASTRO DE EXERCÍCIOS</h2>
    </header>
    <div className="form-view">

      <section className="data-grid-section">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Exercícios cadastrados</p>
          </div>
          <div className="child-grid-toolbar-actions">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar exercício"
                type="search"
                value={searchTerm}
              />
            </label>
            {!readOnly ? (
              <button className="new-button" onClick={handleNewExercise} type="button">
                <Plus size={16} />
                Novo
              </button>
            ) : null}
          </div>
        </div>

        <div aria-label="Exercícios cadastrados" className="product-table" role="table">
          <div
            className="product-row header"
            role="row"
            style={readOnly ? undefined : { gridTemplateColumns: 'minmax(0, 1fr) 6.875rem 6.875rem 2.75rem' }}
          >
            <span role="columnheader">Exercício</span>
            <span role="columnheader">Empresa</span>
            <span role="columnheader">Status</span>
            {!readOnly ? <span role="columnheader" /> : null}
          </div>

          {paginatedExercises.map((exercise) =>
            readOnly ? (
              <button
                className={`product-row selectable${exercise.id === selectedExerciseId ? ' selected' : ''}`}
                key={exercise.id}
                onClick={() => setSelectedExerciseId(exercise.id)}
                role="row"
                type="button"
              >
                <span role="cell" title={exercise.dsExercicio}>{exercise.dsExercicio}</span>
                <span role="cell" title={getCompanyLabel(exercise.idEmpresa)}>{getCompanyLabel(exercise.idEmpresa)}</span>
                <span role="cell">
                  <span className={`status-badge ${exercise.boInativo === false ? 'active' : 'inactive'}`}>
                    {exercise.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ) : (
              <div
                className={`product-row selectable${exercise.id === selectedExerciseId ? ' selected' : ''}`}
                key={exercise.id}
                onClick={() => setSelectedExerciseId(exercise.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedExerciseId(exercise.id); } }}
                role="row"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 6.875rem 6.875rem 2.75rem' }}
                tabIndex={0}
              >
                <span role="cell" title={exercise.dsExercicio}>{exercise.dsExercicio}</span>
                <span role="cell" title={getCompanyLabel(exercise.idEmpresa)}>{getCompanyLabel(exercise.idEmpresa)}</span>
                <span role="cell">
                  <span className={`status-badge ${exercise.boInativo === false ? 'active' : 'inactive'}`}>
                    {exercise.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
                <span role="cell" className="grid-row-actions">
                  <button
                    aria-label="Editar exercício"
                    className="grid-edit-button"
                    onClick={(e) => { e.stopPropagation(); handleEditExercise(exercise); }}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                </span>
              </div>
            )
          )}

          {paginatedExercises.length === 0 ? (
            <div className="empty-row">Nenhum exercício encontrado.</div>
          ) : null}
        </div>

        <GridPagination onChange={setExercisesPage} page={exercisesPage} totalItems={filteredExercises.length} />
      </section>

      {!readOnly ? (
        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Novo Exercício' : 'Editar Exercício'}
          onClose={handleCloseDrawer}
        >
          <form className="drawer-form" onSubmit={handleSaveExercise}>
            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <div className="field">
              <label htmlFor="exerciseName">Nome do exercício</label>
              <input
                disabled={!isFormEnabled}
                id="exerciseName"
                maxLength={255}
                onChange={(e) => setExerciseName(e.target.value)}
                placeholder="Ex.: Supino reto"
                ref={exerciseNameInputRef}
                required
                type="text"
                value={exerciseName}
              />
            </div>

            <div className="field">
              <label htmlFor="exerciseInstructions">Instruções</label>
              <textarea
                disabled={!isFormEnabled}
                id="exerciseInstructions"
                maxLength={2000}
                onChange={(e) => setExerciseInstructions(e.target.value)}
                placeholder="Como executar o exercício"
                rows={4}
                value={exerciseInstructions}
              />
            </div>

            <div className="field">
              <label htmlFor="exerciseCompany">Empresa</label>
              <select
                disabled={!isFormEnabled}
                id="exerciseCompany"
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                value={selectedCompanyId}
              >
                <option value="">Selecione</option>
                {companies.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.dsEmpresa}
                  </option>
                ))}
              </select>
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
              <button
                className="secondary-button"
                onClick={() => { clearForm(); handleCloseDrawer(); }}
                type="button"
              >
                Limpar
              </button>
              <button disabled={!isFormEnabled} type="submit">
                <Save size={16} />
                Salvar exercício
              </button>
            </div>

            {selectedExerciseId ? (
              <section aria-label="Arquivos do exercício" className="exercise-files-section">
                <div className="exercise-files-header">
                  <p className="section-label">Arquivos</p>
                </div>

                {fileFeedback ? <div className="form-feedback">{fileFeedback}</div> : null}

                <div className="file-upload-controls">
                  <input
                    disabled={isUploadingFile}
                    id="exerciseFile"
                    onChange={(e) => {
                      const [file] = Array.from(e.target.files ?? []);
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
                        <img
                          alt={file.dsArquivo ?? file.anCaminho}
                          className="student-file-preview"
                          src={previewUrls[file.id]}
                        />
                      ) : null}
                      <div className="student-file-row-info">
                        <strong>{file.dsArquivo ?? file.anCaminho.split('/').pop() ?? `Arquivo ${file.id}`}</strong>
                        <span>{file.anCaminho}</span>
                      </div>
                      <div className="student-file-actions">
                        <button
                          className="secondary-button"
                          onClick={() => void handleOpenExerciseFile(file.id)}
                          type="button"
                        >
                          Visualizar
                        </button>
                        <button
                          className="danger"
                          onClick={() => void handleRemoveExerciseFile(file.id)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                  {exerciseFiles.length === 0 ? (
                    <div className="empty-row">Nenhum arquivo anexado.</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {selectedExerciseId ? (
              <section aria-label="Equipamentos do exercício" className="exercise-files-section">
                <div className="exercise-files-header">
                  <p className="section-label">Equipamentos</p>
                </div>

                {equipmentFeedback ? <div className="form-feedback">{equipmentFeedback}</div> : null}

                <div className="file-upload-controls">
                  <select
                    disabled={isSavingEquipment}
                    onChange={(e) => setSelectedEquipmentToAdd(e.target.value)}
                    value={selectedEquipmentToAdd}
                  >
                    <option value="">Selecione um equipamento</option>
                    {equipmentOptions
                      .filter((equipment) =>
                        !exerciseEquipment.some(
                          (link) => link.boInativo === false && link.idEquipamento === equipment.id,
                        ),
                      )
                      .map((equipment) => (
                        <option key={equipment.id} value={equipment.id}>
                          {equipment.nmEquipamento}
                        </option>
                      ))}
                  </select>
                  <button
                    className="secondary-button"
                    disabled={isSavingEquipment || !selectedEquipmentToAdd}
                    onClick={() => void handleAddExerciseEquipment()}
                    type="button"
                  >
                    Vincular
                  </button>
                </div>

                <div className="student-files-list">
                  {exerciseEquipment.map((link) => (
                    <div className="student-file-row" key={link.id}>
                      <div className="student-file-row-info">
                        <strong>{link.equipamento?.nmEquipamento ?? `Equipamento ${link.idEquipamento}`}</strong>
                      </div>
                      <div className="student-file-actions">
                        <button
                          className="danger"
                          onClick={() => void handleRemoveExerciseEquipment(link.id)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                  {exerciseEquipment.length === 0 ? (
                    <div className="empty-row">Nenhum equipamento vinculado.</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {selectedExerciseId ? (
              <section aria-label="Áreas do corpo do exercício" className="exercise-files-section">
                <div className="exercise-files-header">
                  <p className="section-label">Áreas do corpo</p>
                </div>

                {areaFeedback ? <div className="form-feedback">{areaFeedback}</div> : null}

                <div className="file-upload-controls">
                  <select
                    disabled={isSavingArea}
                    onChange={(e) => setSelectedAreaToAdd(e.target.value)}
                    value={selectedAreaToAdd}
                  >
                    <option value="">Selecione uma área</option>
                    {areaOptions
                      .filter((area) =>
                        !exerciseAreas.some(
                          (link) => link.boInativo === false && link.idAreaCorporal === area.id,
                        ),
                      )
                      .map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.dsAreaCorporal}
                        </option>
                      ))}
                  </select>
                  <button
                    className="secondary-button"
                    disabled={isSavingArea || !selectedAreaToAdd}
                    onClick={() => void handleAddExerciseArea()}
                    type="button"
                  >
                    Vincular
                  </button>
                </div>

                <div className="student-files-list">
                  {exerciseAreas.map((link) => (
                    <div className="student-file-row" key={link.id}>
                      <div className="student-file-row-info">
                        <strong>{link.areaCorporal?.dsAreaCorporal ?? `Área ${link.idAreaCorporal}`}</strong>
                      </div>
                      <div className="student-file-actions">
                        <button
                          className="danger"
                          onClick={() => void handleRemoveExerciseArea(link.id)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                  {exerciseAreas.length === 0 ? (
                    <div className="empty-row">Nenhuma área vinculada.</div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </form>
        </RegistrationDrawer>
      ) : null}
    </div>
    </>
  );
}
