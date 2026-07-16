'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, GridPagination, formatDateInput, isImageFile, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import type { Equipamento, EquipamentoArquivo, EquipamentoManutencao } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type EquipmentRegistrationProps = {
  readOnly?: boolean;
};

function toApiDate(value: string) {
  return value ? value : null;
}

export function EquipmentRegistration({ readOnly = false }: EquipmentRegistrationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const equipmentNameInputRef = useRef<HTMLInputElement | null>(null);

  const [equipments, setEquipments] = useState<Equipamento[]>([]);
  const [equipmentsPage, setEquipmentsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [equipmentNumber, setEquipmentNumber] = useState('');
  const [equipmentName, setEquipmentName] = useState('');
  const [equipmentDescription, setEquipmentDescription] = useState('');
  const [equipmentAcquisitionDate, setEquipmentAcquisitionDate] = useState('');
  const [isEquipmentActive, setIsEquipmentActive] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [equipmentFiles, setEquipmentFiles] = useState<EquipamentoArquivo[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [maintenances, setMaintenances] = useState<EquipamentoManutencao[]>([]);
  const [maintenanceExecutionDate, setMaintenanceExecutionDate] = useState('');
  const [maintenanceValidityDate, setMaintenanceValidityDate] = useState('');
  const [maintenanceFeedback, setMaintenanceFeedback] = useState('');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isFormEnabled = selectedEquipmentId !== null || isCreating;

  const filteredEquipments = equipments.filter((equipment) => {
    const search = searchTerm.toLowerCase();
    return (
      (equipment.nmEquipamento ?? '').toLowerCase().includes(search) ||
      (equipment.dsEquipamento ?? '').toLowerCase().includes(search)
    );
  });
  const equipmentsTotalPages = Math.max(1, Math.ceil(filteredEquipments.length / GRID_PAGE_SIZE));
  const paginatedEquipments = paginateItems(filteredEquipments, equipmentsPage);

  async function loadEquipments() {
    try {
      const response = await fetch(`${apiUrl}/equipments`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os equipamentos.');
      setEquipments((await response.json()) as Equipamento[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar equipamentos.');
    }
  }

  async function loadEquipmentFiles(equipmentId: number) {
    try {
      const response = await fetch(`${apiUrl}/equipments/${equipmentId}/files`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os arquivos.');
      const data = (await response.json()) as EquipamentoArquivo[];
      setEquipmentFiles(data);
      setFileFeedback('');

      const imageFiles = data.filter((file) => isImageFile(file.anCaminho));
      const urlEntries = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const urlResponse = await fetch(`${apiUrl}/equipments/${equipmentId}/files/${file.id}/url`);
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

  async function loadMaintenances(equipmentId: number) {
    try {
      const response = await fetch(`${apiUrl}/equipments/${equipmentId}/maintenances`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as manutenções.');
      setMaintenances((await response.json()) as EquipamentoManutencao[]);
      setMaintenanceFeedback('');
    } catch (error) {
      setMaintenanceFeedback(error instanceof Error ? error.message : 'Erro ao carregar manutenções.');
    }
  }

  useEffect(() => {
    void loadEquipments();
  }, []);

  useEffect(() => {
    setEquipmentsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (equipmentsPage > equipmentsTotalPages) setEquipmentsPage(equipmentsTotalPages);
  }, [equipmentsPage, equipmentsTotalPages]);

  useEffect(() => {
    if (!selectedEquipmentId) {
      setEquipmentFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      setMaintenances([]);
      setMaintenanceFeedback('');
      return;
    }
    void loadEquipmentFiles(selectedEquipmentId);
    void loadMaintenances(selectedEquipmentId);
  }, [selectedEquipmentId]);

  function clearForm() {
    setSelectedEquipmentId(null);
    setIsCreating(false);
    setEquipmentNumber('');
    setEquipmentName('');
    setEquipmentDescription('');
    setEquipmentAcquisitionDate('');
    setIsEquipmentActive(false);
    setFeedback('');
    setFileFeedback('');
    setMaintenanceFeedback('');
    setMaintenanceExecutionDate('');
    setMaintenanceValidityDate('');
    setEquipmentFiles([]);
    setPreviewUrls({});
    setMaintenances([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleNewEquipment() {
    clearForm();
    setIsCreating(true);
    setIsEquipmentActive(true);
    setIsDrawerOpen(true);
    setTimeout(() => equipmentNameInputRef.current?.focus(), 100);
  }

  function handleEditEquipment(equipment: Equipamento) {
    setSelectedEquipmentId(equipment.id);
    setIsCreating(false);
    setEquipmentNumber(equipment.nrEquipamento ? String(equipment.nrEquipamento) : '');
    setEquipmentName(equipment.nmEquipamento ?? '');
    setEquipmentDescription(equipment.dsEquipamento ?? '');
    setEquipmentAcquisitionDate(formatDateInput(equipment.dtAquisicao ?? ''));
    setIsEquipmentActive(equipment.boInativo === false);
    setFeedback('');
    setFileFeedback('');
    setMaintenanceFeedback('');
    setIsDrawerOpen(true);
  }

  function handleCloseDrawer() {
    setIsDrawerOpen(false);
  }

  async function handleToggleStatus() {
    const nextActive = !isEquipmentActive;
    setIsEquipmentActive(nextActive);
    if (!selectedEquipmentId) return;

    try {
      const response = await fetch(`${apiUrl}/equipments/${selectedEquipmentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: nextActive ? false : true }),
      });

      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Equipamento;
      setEquipments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsEquipmentActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = {
        nrEquipamento: equipmentNumber ? Number(equipmentNumber) : null,
        dsEquipamento: equipmentDescription,
        nmEquipamento: equipmentName,
        dtAquisicao: toApiDate(equipmentAcquisitionDate),
        boInativo: isEquipmentActive ? false : true,
      };

      const response = await fetch(
        selectedEquipmentId ? `${apiUrl}/equipments/${selectedEquipmentId}` : `${apiUrl}/equipments`,
        {
          method: selectedEquipmentId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Equipamento;
      setEquipments((current) => {
        if (selectedEquipmentId) return current.map((item) => (item.id === saved.id ? saved : item));
        return [...current, saved].sort((a, b) => (a.nmEquipamento ?? '').localeCompare(b.nmEquipamento ?? ''));
      });
      setSelectedEquipmentId(saved.id);
      setIsCreating(false);
      setFeedback('Equipamento salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  async function handleUploadEquipmentFile(file: File | null) {
    if (!file) return;
    if (!selectedEquipmentId) {
      setFileFeedback('Salve o equipamento antes de anexar arquivos.');
      return;
    }

    try {
      setIsUploadingFile(true);
      setFileFeedback('');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/equipments/${selectedEquipmentId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível enviar o arquivo.');
      }

      await loadEquipmentFiles(selectedEquipmentId);
      setFileFeedback('Arquivo enviado com sucesso.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleOpenEquipmentFile(fileId: number) {
    if (!selectedEquipmentId) return;

    try {
      const response = await fetch(`${apiUrl}/equipments/${selectedEquipmentId}/files/${fileId}/url`);
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

  async function handleRemoveEquipmentFile(fileId: number) {
    if (!selectedEquipmentId) return;

    try {
      const response = await fetch(`${apiUrl}/equipments/${selectedEquipmentId}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover o arquivo.');
      }

      await loadEquipmentFiles(selectedEquipmentId);
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  async function handleAddMaintenance() {
    if (!selectedEquipmentId) {
      setMaintenanceFeedback('Salve o equipamento antes de registrar manutenções.');
      return;
    }

    try {
      setIsSavingMaintenance(true);
      const payload = {
        dtExecucao: toApiDate(maintenanceExecutionDate),
        dtValidade: toApiDate(maintenanceValidityDate),
        boInativo: false,
      };

      const response = await fetch(`${apiUrl}/equipments/${selectedEquipmentId}/maintenances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível registrar a manutenção.');
      }

      setMaintenanceExecutionDate('');
      setMaintenanceValidityDate('');
      await loadMaintenances(selectedEquipmentId);
      setMaintenanceFeedback('Manutenção registrada com sucesso.');
    } catch (error) {
      setMaintenanceFeedback(error instanceof Error ? error.message : 'Erro ao registrar manutenção.');
    } finally {
      setIsSavingMaintenance(false);
    }
  }

  async function handleRemoveMaintenance(maintenanceId: number) {
    if (!selectedEquipmentId) return;

    try {
      const response = await fetch(
        `${apiUrl}/equipments/${selectedEquipmentId}/maintenances/${maintenanceId}`,
        { method: 'DELETE' },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover a manutenção.');
      }

      await loadMaintenances(selectedEquipmentId);
      setMaintenanceFeedback('Manutenção removida.');
    } catch (error) {
      setMaintenanceFeedback(error instanceof Error ? error.message : 'Erro ao remover manutenção.');
    }
  }

  return (
    <>
    <header className="module-page-header">
      <p className="section-label">Equipamentos</p>
      <h2 className="module-page-title">CADASTRO DE EQUIPAMENTOS</h2>
    </header>
    <div className="form-view">

      <section className="data-grid-section">
        <div className="grid-toolbar">
          <div className="child-grid-toolbar-label">
            <p className="section-label">Equipamentos cadastrados</p>
          </div>
          <div className="child-grid-toolbar-actions">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar equipamento"
                type="search"
                value={searchTerm}
              />
            </label>
            {!readOnly ? (
              <button className="new-button" onClick={handleNewEquipment} type="button">
                <Plus size={16} />
                Novo
              </button>
            ) : null}
          </div>
        </div>

        <div aria-label="Equipamentos cadastrados" className="product-table" role="table">
          <div
            className="product-row header"
            role="row"
            style={readOnly ? undefined : { gridTemplateColumns: 'minmax(0, 1fr) 6.875rem 6.875rem 2.75rem' }}
          >
            <span role="columnheader">Equipamento</span>
            <span role="columnheader">Número</span>
            <span role="columnheader">Status</span>
            {!readOnly ? <span role="columnheader" /> : null}
          </div>

          {paginatedEquipments.map((equipment) => (
            <div
              className={`product-row selectable${equipment.id === selectedEquipmentId ? ' selected' : ''}`}
              key={equipment.id}
              onClick={() => !readOnly && handleEditEquipment(equipment)}
              onKeyDown={(e) => {
                if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleEditEquipment(equipment);
                }
              }}
              role="row"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) 6.875rem 6.875rem 2.75rem' }}
              tabIndex={0}
            >
              <span role="cell" title={equipment.nmEquipamento ?? ''}>{equipment.nmEquipamento}</span>
              <span role="cell">{equipment.nrEquipamento ?? '-'}</span>
              <span role="cell">
                <span className={`status-badge ${equipment.boInativo === false ? 'active' : 'inactive'}`}>
                  {equipment.boInativo === false ? 'Ativo' : 'Inativo'}
                </span>
              </span>
              {!readOnly ? (
                <span role="cell" className="grid-row-actions">
                  <button
                    aria-label="Editar equipamento"
                    className="grid-edit-button"
                    onClick={(e) => { e.stopPropagation(); handleEditEquipment(equipment); }}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                </span>
              ) : null}
            </div>
          ))}

          {paginatedEquipments.length === 0 ? (
            <div className="empty-row">Nenhum equipamento encontrado.</div>
          ) : null}
        </div>

        <GridPagination onChange={setEquipmentsPage} page={equipmentsPage} totalItems={filteredEquipments.length} />
      </section>

      {!readOnly ? (
        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Novo Equipamento' : 'Editar Equipamento'}
          onClose={handleCloseDrawer}
        >
          <form className="drawer-form" onSubmit={handleSaveEquipment}>
            {feedback ? <div className="form-feedback">{feedback}</div> : null}

            <div className="field">
              <label htmlFor="equipmentName">Nome do equipamento</label>
              <input
                disabled={!isFormEnabled}
                id="equipmentName"
                maxLength={100}
                onChange={(e) => setEquipmentName(e.target.value)}
                placeholder="Ex.: Esteira ergométrica"
                ref={equipmentNameInputRef}
                required
                type="text"
                value={equipmentName}
              />
            </div>

            <div className="field">
              <label htmlFor="equipmentNumber">Número / patrimônio</label>
              <input
                disabled={!isFormEnabled}
                id="equipmentNumber"
                onChange={(e) => setEquipmentNumber(e.target.value)}
                placeholder="0"
                type="number"
                value={equipmentNumber}
              />
            </div>

            <div className="field">
              <label htmlFor="equipmentDescription">Descrição</label>
              <input
                disabled={!isFormEnabled}
                id="equipmentDescription"
                maxLength={200}
                onChange={(e) => setEquipmentDescription(e.target.value)}
                placeholder="Detalhes do equipamento"
                type="text"
                value={equipmentDescription}
              />
            </div>

            <div className="field">
              <label htmlFor="equipmentAcquisitionDate">Data de aquisição</label>
              <input
                disabled={!isFormEnabled}
                id="equipmentAcquisitionDate"
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEquipmentAcquisitionDate(e.target.value)}
                type="date"
                value={equipmentAcquisitionDate}
              />
            </div>

            <div className="field">
              <label htmlFor="equipmentStatus">Status</label>
              <button
                aria-pressed={isEquipmentActive}
                className={`status-toggle ${isEquipmentActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="equipmentStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isEquipmentActive ? 'Ativo' : 'Inativo'}</span>
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
                Salvar equipamento
              </button>
            </div>

            {selectedEquipmentId ? (
              <section aria-label="Arquivos do equipamento" className="exercise-files-section">
                <div className="exercise-files-header">
                  <p className="section-label">Arquivos</p>
                </div>

                {fileFeedback ? <div className="form-feedback">{fileFeedback}</div> : null}

                <div className="file-upload-controls">
                  <input
                    disabled={isUploadingFile}
                    id="equipmentFile"
                    onChange={(e) => {
                      const [file] = Array.from(e.target.files ?? []);
                      void handleUploadEquipmentFile(file ?? null);
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                </div>

                <div className="student-files-list">
                  {equipmentFiles.map((file) => (
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
                          onClick={() => void handleOpenEquipmentFile(file.id)}
                          type="button"
                        >
                          Visualizar
                        </button>
                        <button
                          className="danger"
                          onClick={() => void handleRemoveEquipmentFile(file.id)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                  {equipmentFiles.length === 0 ? (
                    <div className="empty-row">Nenhum arquivo anexado.</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {selectedEquipmentId ? (
              <section aria-label="Manutenções do equipamento" className="exercise-files-section">
                <div className="exercise-files-header">
                  <p className="section-label">Manutenções</p>
                </div>

                {maintenanceFeedback ? <div className="form-feedback">{maintenanceFeedback}</div> : null}

                <div className="drawer-fields">
                  <div className="field field-size-sm">
                    <label htmlFor="maintenanceExecutionDate">Data de execução</label>
                    <input
                      id="maintenanceExecutionDate"
                      onChange={(e) => setMaintenanceExecutionDate(e.target.value)}
                      type="date"
                      value={maintenanceExecutionDate}
                    />
                  </div>
                  <div className="field field-size-sm">
                    <label htmlFor="maintenanceValidityDate">Válida até</label>
                    <input
                      id="maintenanceValidityDate"
                      onChange={(e) => setMaintenanceValidityDate(e.target.value)}
                      type="date"
                      value={maintenanceValidityDate}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      disabled={isSavingMaintenance || !maintenanceExecutionDate}
                      onClick={() => void handleAddMaintenance()}
                      type="button"
                    >
                      <Plus size={16} />
                      Registrar manutenção
                    </button>
                  </div>
                </div>

                <div className="student-files-list">
                  {maintenances.map((maintenance) => (
                    <div className="student-file-row" key={maintenance.id}>
                      <div className="student-file-row-info">
                        <strong>Execução: {formatDateInput(maintenance.dtExecucao ?? '') || '-'}</strong>
                        <span>Válida até: {formatDateInput(maintenance.dtValidade ?? '') || '-'}</span>
                      </div>
                      <div className="student-file-actions">
                        <button
                          className="danger"
                          onClick={() => void handleRemoveMaintenance(maintenance.id)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                  {maintenances.length === 0 ? (
                    <div className="empty-row">Nenhuma manutenção registrada.</div>
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
