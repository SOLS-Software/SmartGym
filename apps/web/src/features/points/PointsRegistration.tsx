'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

type Pontuacao = {
  id: number;
  idEmpresa: number;
  dsPontuacao: string;
  qtPontos: number;
  /** Regra que credita sozinha a cada check-in. No máximo uma por empresa. */
  boPadrao: boolean;
  boInativo: boolean;
};

type Student = { id: number; nmAluno: string; boInativo: boolean };

type PointsEntry = {
  id: number;
  qtPontos: number;
  qtDisponivel: number;
  dsHistorico: string | null;
  dtCadastro: string;
  pontuacao: { id: number; dsPontuacao: string } | null;
  produtoMovimentacao: { id: number; produto: { dsProduto: string } | null } | null;
  alunoCheckIn: { id: number } | null;
};

export function PointsRegistration() {
  const { showToast } = useToast();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const [points, setPoints] = useState<Pontuacao[]>([]);
  const [isLoadingPoints, setIsLoadingPoints] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dsPontuacao, setDsPontuacao] = useState('');
  const [qtPontos, setQtPontos] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isDefaultRule, setIsDefaultRule] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Painel de extrato: consulta e lançamento manual para um aluno.
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [entries, setEntries] = useState<PointsEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [entryPoints, setEntryPoints] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [entryFeedback, setEntryFeedback] = useState('');

  const isFormEnabled = selectedPointId !== null || isCreating;
  const filteredPoints = points.filter((point) =>
    point.dsPontuacao.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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

  async function loadPoints(companyId = selectedCompanyId) {
    if (!companyId) {
      setPoints([]);
      return;
    }

    try {
      setIsLoadingPoints(true);
      const response = await fetch(`${apiUrl}/companies/${companyId}/children/points`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as pontuações.');
      setPoints((await response.json()) as Pontuacao[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar pontuações.');
    } finally {
      setIsLoadingPoints(false);
    }
  }

  async function loadStudents() {
    try {
      const response = await fetch(`${apiUrl}/students`);
      if (!response.ok) return;
      const data = (await response.json()) as Student[];
      setStudents(data.filter((student) => student.boInativo === false));
    } catch {
      // Lista de alunos é do painel de extrato; falhar aqui não pode derrubar
      // o cadastro de regras, que é a função principal da tela.
    }
  }

  async function loadEntries(studentId = selectedStudentId) {
    if (!studentId || !selectedCompanyId) {
      setEntries([]);
      setBalance(null);
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/students/${studentId}/related/points`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar o extrato.');
      const data = (await response.json()) as {
        saldos: Array<{ idEmpresa: number; qtDisponivel: number }>;
        lancamentos: Array<PointsEntry & { idEmpresa: number }>;
      };
      // A tela trabalha uma filial por vez; o extrato acompanha a seleção.
      setEntries(data.lancamentos.filter((item) => item.idEmpresa === selectedCompanyId));
      setBalance(
        data.saldos.find((item) => item.idEmpresa === selectedCompanyId)?.qtDisponivel ?? 0,
      );
      setEntryFeedback('');
    } catch (error) {
      setEntryFeedback(error instanceof Error ? error.message : 'Erro ao carregar extrato.');
    }
  }

  async function handlePostEntry() {
    const pontos = Number(entryPoints);
    if (!selectedStudentId || !selectedCompanyId || !pontos) {
      setEntryFeedback('Escolha o aluno e informe a quantidade de pontos.');
      return;
    }

    try {
      setIsPosting(true);
      const response = await fetch(`${apiUrl}/students/${selectedStudentId}/related/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idEmpresa: selectedCompanyId,
          qtPontos: pontos,
          dsHistorico: entryNote.trim() || null,
        }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível lançar os pontos.');

      setEntryPoints('');
      setEntryNote('');
      await loadEntries();
      showToast(pontos > 0 ? 'Pontos creditados.' : 'Pontos resgatados.');
    } catch (error) {
      setEntryFeedback(error instanceof Error ? error.message : 'Erro ao lançar pontos.');
    } finally {
      setIsPosting(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    void loadStudents();
  }, []);

  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId, selectedCompanyId]);

  useEffect(() => {
    setSelectedPointId(null);
    setIsCreating(false);
    void loadPoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  function handleNew() {
    if (!selectedCompanyId) {
      setFeedback('Selecione uma empresa antes de cadastrar.');
      return;
    }
    setSelectedPointId(null);
    setIsCreating(true);
    setDsPontuacao('');
    setQtPontos('');
    setIsActive(true);
    setIsDefaultRule(false);
    setFeedback('');
    setIsDrawerOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function handleEdit(point: Pontuacao) {
    setSelectedPointId(point.id);
    setIsCreating(false);
    setDsPontuacao(point.dsPontuacao);
    setQtPontos(String(point.qtPontos ?? 0));
    setIsActive(point.boInativo === false);
    setIsDefaultRule(point.boPadrao === true);
    setFeedback('');
    setIsDrawerOpen(true);
  }

  async function handleToggleStatus() {
    const nextActive = !isActive;
    setIsActive(nextActive);
    if (!selectedCompanyId || !selectedPointId) return;

    try {
      const response = await fetch(
        `${apiUrl}/companies/${selectedCompanyId}/children/points/${selectedPointId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: nextActive ? false : true }),
        },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      const updated = (await response.json()) as Pontuacao;
      setPoints((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setIsActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setFeedback('Selecione uma empresa antes de salvar.');
      return;
    }

    try {
      const payload = {
        dsPontuacao: dsPontuacao.trim(),
        qtPontos: qtPontos ? Number(qtPontos) : 0,
        boPadrao: isDefaultRule,
        boInativo: isActive ? false : true,
      };

      const response = await fetch(
        selectedPointId
          ? `${apiUrl}/companies/${selectedCompanyId}/children/points/${selectedPointId}`
          : `${apiUrl}/companies/${selectedCompanyId}/children/points`,
        {
          method: selectedPointId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Pontuacao;
      // Recarrega tudo: marcar esta como padrão desmarca a anterior no
      // servidor, e remendar só o item salvo deixaria duas "Padrão" na grid.
      await loadPoints();
      setSelectedPointId(saved.id);
      setIsCreating(false);
      showToast('Pontuação salva com sucesso.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Alunos</p>
        <h2 className="module-page-title">CADASTRO DE PONTUAÇÕES</h2>
      </header>
      <div className="form-view">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Empresa</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Empresa</span>
                <select
                  onChange={(event) =>
                    setSelectedCompanyId(event.target.value ? Number(event.target.value) : null)
                  }
                  value={selectedCompanyId ?? ''}
                >
                  <option value="">Selecione a empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={String(company.id)}>
                      {company.dsEmpresa}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {feedback ? <div className="form-feedback">{feedback}</div> : null}

          <RegistrationGrid<Pontuacao>
            ariaLabel="Pontuações cadastradas"
            label="Pontuações"
            columns={[
              { label: 'Descrição', render: (r) => r.dsPontuacao, sortValue: (r) => r.dsPontuacao },
              { label: 'Pontos', render: (r) => String(r.qtPontos ?? 0) },
              {
                label: 'Automática',
                render: (r) =>
                  r.boPadrao ? <span className="status-badge active">Padrão</span> : '-',
                sortValue: (r) => (r.boPadrao ? 0 : 1),
              },
              {
                label: 'Status',
                render: (r) => (
                  <span className={`status-badge ${r.boInativo === false ? 'active' : 'inactive'}`}>
                    {r.boInativo === false ? 'Ativo' : 'Inativo'}
                  </span>
                ),
                sortValue: (r) => (r.boInativo === false ? 0 : 1),
              },
            ]}
            records={filteredPoints}
            isLoading={isLoadingPoints}
            selectedId={selectedPointId}
            onSelect={handleEdit}
            onEdit={handleEdit}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar pontuação"
            onNew={handleNew}
            newDisabled={!selectedCompanyId}
            emptyMessage={
              selectedCompanyId
                ? 'Nenhuma pontuação cadastrada para esta empresa.'
                : 'Selecione uma empresa para ver as pontuações.'
            }
          />
        </section>

        <section className="points-ledger" aria-label="Extrato de pontos do aluno">
          <div className="points-ledger-head">
            <div>
              <p className="section-label">Extrato do aluno</p>
              <strong>Consulta e lançamento manual</strong>
            </div>
            <label className="search-field">
              <span>Aluno</span>
              <select
                disabled={!selectedCompanyId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                value={selectedStudentId}
              >
                <option value="">Selecione o aluno</option>
                {students.map((student) => (
                  <option key={student.id} value={String(student.id)}>
                    {student.nmAluno}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {entryFeedback ? <div className="form-feedback">{entryFeedback}</div> : null}

          {!selectedStudentId ? (
            <p className="points-empty">
              Escolha um aluno para ver o saldo dele nesta filial e lançar créditos ou resgates.
            </p>
          ) : (
            <>
              <div className="points-ledger-balance">
                Saldo nesta filial: <strong>{balance ?? 0} pts</strong>
              </div>

              <div className="points-ledger-form">
                <label className="search-field">
                  <span>Pontos</span>
                  <input
                    onChange={(event) => setEntryPoints(event.target.value)}
                    placeholder="10 ou -10"
                    type="number"
                    value={entryPoints}
                  />
                </label>
                <label className="search-field points-ledger-note">
                  <span>Histórico</span>
                  <input
                    maxLength={255}
                    onChange={(event) => setEntryNote(event.target.value)}
                    placeholder="Ex.: bônus de indicação"
                    type="text"
                    value={entryNote}
                  />
                </label>
                <button
                  disabled={isPosting || !entryPoints}
                  onClick={() => void handlePostEntry()}
                  type="button"
                >
                  {isPosting ? 'Lançando...' : 'Lançar'}
                </button>
              </div>
              <p className="points-ledger-hint">
                Valor negativo resgata. O extrato não é editável: para corrigir, lance o
                contrário.
              </p>

              {entries.length === 0 ? (
                <p className="points-empty">Nenhum lançamento nesta filial ainda.</p>
              ) : (
                <ul className="points-entries">
                  {entries.map((entry) => (
                    <li className="points-entry" key={entry.id}>
                      <div className="points-entry-main">
                        <strong>
                          {entry.produtoMovimentacao
                            ? `Resgate: ${entry.produtoMovimentacao.produto?.dsProduto ?? 'produto'}`
                            : entry.alunoCheckIn
                              ? entry.pontuacao?.dsPontuacao ?? 'Check-in'
                              : entry.dsHistorico ?? 'Lançamento manual'}
                        </strong>
                        <span>{new Date(entry.dtCadastro).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className="points-entry-values">
                        <span
                          className={`points-entry-delta ${entry.qtPontos < 0 ? 'debit' : 'credit'}`}
                        >
                          {entry.qtPontos > 0 ? '+' : ''}
                          {entry.qtPontos}
                        </span>
                        <span className="points-entry-balance">saldo {entry.qtDisponivel}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={isCreating ? 'Nova Pontuação' : 'Editar Pontuação'}
          onClose={() => setIsDrawerOpen(false)}
        >
          <form className="drawer-fields" onSubmit={handleSave}>
            {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
            <RegistrationField
              hint="A regra padrão credita sozinha a cada check-in do aluno. Marcar esta desmarca a anterior."
              htmlFor="pontuacaoPadrao"
              label="Crédito automático"
              size="full"
            >
              <button
                aria-pressed={isDefaultRule}
                className={`status-toggle ${isDefaultRule ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="pontuacaoPadrao"
                onClick={() => setIsDefaultRule((current) => !current)}
                type="button"
              >
                {isDefaultRule ? 'Regra padrão do check-in' : 'Somente manual'}
              </button>
            </RegistrationField>
            <RegistrationField htmlFor="pontuacaoDescricao" label="Descrição" size="full">
              <input
                disabled={!isFormEnabled}
                id="pontuacaoDescricao"
                maxLength={255}
                onChange={(event) => setDsPontuacao(event.target.value)}
                placeholder="Ex.: Check-in diário"
                ref={nameInputRef}
                required
                type="text"
                value={dsPontuacao}
              />
            </RegistrationField>
            <RegistrationField htmlFor="pontuacaoPontos" label="Pontos" size="sm">
              <input
                disabled={!isFormEnabled}
                id="pontuacaoPontos"
                inputMode="numeric"
                onChange={(event) => setQtPontos(event.target.value)}
                placeholder="0"
                type="number"
                value={qtPontos}
              />
            </RegistrationField>
            <RegistrationField htmlFor="pontuacaoStatus" label="Status" size="sm">
              <button
                aria-pressed={isActive}
                className={`status-toggle ${isActive ? 'active' : ''}`}
                disabled={!isFormEnabled}
                id="pontuacaoStatus"
                onClick={handleToggleStatus}
                type="button"
              >
                <span>{isActive ? 'Ativo' : 'Inativo'}</span>
              </button>
            </RegistrationField>
            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              <button disabled={!isFormEnabled} type="submit"><Save size={16} />Salvar pontuação</button>
            </div>
          </form>
        </RegistrationDrawer>
      </div>
    </>
  );
}
