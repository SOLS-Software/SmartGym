'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Phone, Plus, UserPlus } from 'lucide-react';
import { LIMITES } from '@smartgym/shared';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';
import type { Company } from '../../shared/registration/registrationTypes';

// Funil de interessados: quem procurou a academia e ainda não é aluno.
//
// A tela existe para responder duas perguntas que antes ninguém conseguia
// fazer: quantos procuraram, e quantos viraram aluno. Por isso o status é o
// elemento central — sem ele o registro seria só uma caixa de entrada, e uma
// caixa de entrada não vira funil.

type LeadStatus = 'novo' | 'em_contato' | 'convertido' | 'perdido';

type Lead = {
  id: number;
  nmLead: string;
  nrDDD: number | null;
  nrContato: string | null;
  anEmail: string;
  dsMensagem: string | null;
  dsObservacao: string | null;
  cnStatus: LeadStatus;
  caOrigem: string;
  dtCadastro: string;
  dtContato: string | null;
  empresa: { id: number; dsEmpresa: string } | null;
  plano: { id: number; dsPlano: string } | null;
  aluno: { id: number; nmAluno: string } | null;
};

type Student = { id: number; nmAluno: string; boInativo: boolean };

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novos',
  em_contato: 'Em contato',
  convertido: 'Viraram aluno',
  perdido: 'Perdidos',
};

const STATUS_ORDER: LeadStatus[] = ['novo', 'em_contato', 'convertido', 'perdido'];

const dataHora = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function formatContact(lead: Lead) {
  if (lead.nrContato) return `(${lead.nrDDD ?? ''}) ${lead.nrContato}`;
  return lead.anEmail || 'sem contato';
}

export function LeadFunnel() {
  const { showToast } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filter, setFilter] = useState<LeadStatus | 'todos'>('novo');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [linking, setLinking] = useState<number | null>(null);
  const [linkTerm, setLinkTerm] = useState('');
  const [feedback, setFeedback] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novaMensagem, setNovaMensagem] = useState('');
  const [novaEmpresa, setNovaEmpresa] = useState('');

  async function loadLeads() {
    try {
      const response = await fetch(`${apiUrl}/leads`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar os interessados.');
      setLeads((await response.json()) as Lead[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar interessados.');
    }
  }

  async function loadAuxiliary() {
    try {
      const [companiesResponse, studentsResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/students`),
      ]);
      if (companiesResponse.ok) {
        const data = (await companiesResponse.json()) as Company[];
        setCompanies(data.filter((company) => company.boInativo === false));
      }
      if (studentsResponse.ok) {
        const data = (await studentsResponse.json()) as Student[];
        setStudents(data.filter((student) => student.boInativo === false));
      }
    } catch {
      // A tela funciona sem estas listas: elas só alimentam o formulário de
      // balcão e o vínculo com o aluno.
    }
  }

  useEffect(() => {
    void loadLeads();
    void loadAuxiliary();
  }, []);

  const counts = useMemo(() => {
    const totals: Record<string, number> = { todos: leads.length };
    for (const status of STATUS_ORDER) {
      totals[status] = leads.filter((lead) => lead.cnStatus === status).length;
    }
    return totals;
  }, [leads]);

  const visible = useMemo(
    () => (filter === 'todos' ? leads : leads.filter((lead) => lead.cnStatus === filter)),
    [leads, filter],
  );

  const linkMatches = useMemo(() => {
    const needle = linkTerm.trim().toLowerCase();
    if (needle.length < 2) return [];
    return students.filter((s) => s.nmAluno.toLowerCase().includes(needle)).slice(0, 6);
  }, [linkTerm, students]);

  async function patchLead(lead: Lead, body: Record<string, unknown>, mensagem: string) {
    try {
      setSavingId(lead.id);
      const response = await fetch(`${apiUrl}/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível atualizar o interessado.');
      await loadLeads();
      showToast(mensagem);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao atualizar interessado.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (novoNome.trim().length < 2) {
      setFeedback('Informe o nome do interessado.');
      return;
    }
    const digits = novoTelefone.replace(/\D/g, '');
    try {
      setSavingId(-1);
      const response = await fetch(`${apiUrl}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nmLead: novoNome.trim(),
          nrDDD: digits.slice(0, 2),
          nrContato: digits.slice(2),
          anEmail: novoEmail.trim(),
          dsMensagem: novaMensagem.trim(),
          idEmpresa: novaEmpresa || null,
        }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível registrar o interessado.');

      setNovoNome('');
      setNovoTelefone('');
      setNovoEmail('');
      setNovaMensagem('');
      setIsCreating(false);
      await loadLeads();
      showToast('Interessado registrado.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar interessado.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Alunos</p>
        <h2 className="module-page-title">INTERESSADOS</h2>
      </header>

      <div className="form-view leads">
        <div className="leads-toolbar">
          <div className="leads-tabs" role="tablist">
            {STATUS_ORDER.map((status) => (
              <button
                aria-selected={filter === status}
                className={filter === status ? 'active' : ''}
                key={status}
                onClick={() => setFilter(status)}
                role="tab"
                type="button"
              >
                {STATUS_LABEL[status]}
                <span>{counts[status] ?? 0}</span>
              </button>
            ))}
            <button
              aria-selected={filter === 'todos'}
              className={filter === 'todos' ? 'active' : ''}
              onClick={() => setFilter('todos')}
              role="tab"
              type="button"
            >
              Todos
              <span>{counts.todos ?? 0}</span>
            </button>
          </div>

          <button
            className="leads-new"
            onClick={() => setIsCreating((open) => !open)}
            type="button"
          >
            <Plus aria-hidden="true" size={15} />
            Registrar do balcão
          </button>
        </div>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        {isCreating ? (
          <form className="leads-create" onSubmit={handleCreate}>
            {/* Nenhum destes campos tinha maxLength: o servidor recorta em
                zod (min 2 / max 255, 100, 500) e devolvia "Dados invalidos."
                sem dizer qual. Os limites saem das mesmas colunas. */}
            <label>
              <span>Nome</span>
              <input
                maxLength={LIMITES.lead.nmLead}
                minLength={2}
                onChange={(event) => setNovoNome(event.target.value)}
                required
                type="text"
                value={novoNome}
              />
            </label>
            <label>
              <span>Telefone</span>
              <input
                inputMode="tel"
                maxLength={15}
                onChange={(event) => setNovoTelefone(event.target.value)}
                placeholder="(00) 00000-0000"
                type="tel"
                value={novoTelefone}
              />
            </label>
            <label>
              <span>E-mail</span>
              <input
                maxLength={LIMITES.lead.anEmail}
                onChange={(event) => setNovoEmail(event.target.value)}
                type="email"
                value={novoEmail}
              />
            </label>
            <label>
              <span>Unidade</span>
              <select
                onChange={(event) => setNovaEmpresa(event.target.value)}
                value={novaEmpresa}
              >
                <option value="">Não informada</option>
                {companies.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.dsEmpresa}
                  </option>
                ))}
              </select>
            </label>
            <label className="leads-create-wide">
              <span>O que ele procura</span>
              <input
                maxLength={LIMITES.lead.dsMensagem}
                onChange={(event) => setNovaMensagem(event.target.value)}
                type="text"
                value={novaMensagem}
              />
            </label>
            <button disabled={savingId === -1} type="submit">
              {savingId === -1 ? 'Salvando...' : 'Registrar'}
            </button>
          </form>
        ) : null}

        {visible.length === 0 ? (
          <p className="leads-empty">
            {filter === 'novo'
              ? 'Nenhum interessado aguardando contato.'
              : 'Nada nesta etapa do funil.'}
          </p>
        ) : (
          <ul className="leads-list">
            {visible.map((lead) => (
              <li className={`lead-card status-${lead.cnStatus}`} key={lead.id}>
                <div className="lead-head">
                  <div>
                    <strong>{lead.nmLead}</strong>
                    <span className="lead-contact">
                      <Phone aria-hidden="true" size={12} />
                      {formatContact(lead)}
                      {lead.anEmail && lead.nrContato ? ` · ${lead.anEmail}` : ''}
                    </span>
                  </div>
                  <div className="lead-meta">
                    <span className={`lead-origin ${lead.caOrigem}`}>
                      {lead.caOrigem === 'site' ? 'pelo site' : 'no balcão'}
                    </span>
                    <span>{dataHora(lead.dtCadastro)}</span>
                  </div>
                </div>

                {lead.dsMensagem ? (
                  <p className="lead-message">
                    <MessageSquare aria-hidden="true" size={13} />
                    {lead.dsMensagem}
                  </p>
                ) : null}

                {lead.empresa || lead.plano ? (
                  <p className="lead-context">
                    {lead.empresa ? lead.empresa.dsEmpresa : null}
                    {lead.empresa && lead.plano ? ' · ' : null}
                    {lead.plano ? `interesse em ${lead.plano.dsPlano}` : null}
                  </p>
                ) : null}

                {lead.aluno ? (
                  <p className="lead-converted">
                    <UserPlus aria-hidden="true" size={13} />
                    Virou aluno: {lead.aluno.nmAluno}
                  </p>
                ) : null}

                {lead.dsObservacao ? <p className="lead-note">“{lead.dsObservacao}”</p> : null}

                <div className="lead-actions">
                  <input
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [lead.id]: event.target.value }))
                    }
                    placeholder="Anotação do atendimento"
                    type="text"
                    value={notes[lead.id] ?? ''}
                  />
                  <button
                    className="secondary-button"
                    disabled={savingId === lead.id || !(notes[lead.id] ?? '').trim()}
                    onClick={() => {
                      void patchLead(
                        lead,
                        { dsObservacao: notes[lead.id] },
                        'Anotação salva.',
                      ).then(() => setNotes((current) => ({ ...current, [lead.id]: '' })));
                    }}
                    type="button"
                  >
                    Anotar
                  </button>

                  {lead.cnStatus !== 'em_contato' && lead.cnStatus !== 'convertido' ? (
                    <button
                      className="secondary-button"
                      disabled={savingId === lead.id}
                      onClick={() =>
                        void patchLead(lead, { cnStatus: 'em_contato' }, 'Marcado como em contato.')
                      }
                      type="button"
                    >
                      Em contato
                    </button>
                  ) : null}

                  {lead.cnStatus !== 'perdido' ? (
                    <button
                      className="secondary-button"
                      disabled={savingId === lead.id}
                      onClick={() => void patchLead(lead, { cnStatus: 'perdido' }, 'Marcado como perdido.')}
                      type="button"
                    >
                      Perdido
                    </button>
                  ) : null}

                  {lead.cnStatus !== 'convertido' ? (
                    <button
                      disabled={savingId === lead.id}
                      onClick={() => {
                        setLinking(linking === lead.id ? null : lead.id);
                        setLinkTerm('');
                      }}
                      type="button"
                    >
                      Virou aluno
                    </button>
                  ) : null}
                </div>

                {/* Fechar o funil exige apontar QUEM virou aluno. Sem o vínculo,
                    "convertido" seria uma palavra sem ninguém do outro lado — e
                    a taxa de conversão viraria um número que ninguém consegue
                    conferir. Ainda assim dá para marcar sem vincular: quem
                    cadastrou o aluno em outro dia não deve ficar preso à busca. */}
                {linking === lead.id ? (
                  <div className="lead-link">
                    <input
                      autoFocus
                      onChange={(event) => setLinkTerm(event.target.value)}
                      placeholder="Buscar o aluno já cadastrado"
                      type="search"
                      value={linkTerm}
                    />
                    {linkMatches.length > 0 ? (
                      <ul>
                        {linkMatches.map((student) => (
                          <li key={student.id}>
                            <button
                              onClick={() => {
                                setLinking(null);
                                void patchLead(
                                  lead,
                                  { cnStatus: 'convertido', idAluno: student.id },
                                  `${lead.nmLead} virou aluno.`,
                                );
                              }}
                              type="button"
                            >
                              {student.nmAluno}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setLinking(null);
                        void patchLead(lead, { cnStatus: 'convertido' }, 'Marcado como convertido.');
                      }}
                      type="button"
                    >
                      Marcar sem vincular
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
