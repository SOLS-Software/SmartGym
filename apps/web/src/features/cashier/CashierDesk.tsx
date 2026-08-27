'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Search } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';
import type { Company } from '../../shared/registration/registrationTypes';

// Caixa: confirmar que o dinheiro entrou.
//
// Antes, dar baixa era achar o aluno, abrir a ficha e editar um registro. Com o
// Pix copia e cola no ar isso virou o gargalo — o aluno paga em dois toques e a
// academia levava cinco cliques e uma busca para registrar.
//
// A tela lista as cobranças em aberto de TODOS os alunos, mais velha primeiro,
// porque quem recebeu um Pix não sabe de quem ele é: procura pelo nome ou pelo
// valor e confirma ali mesmo.

type OpenCharge = {
  id: number;
  idEmpresa: number;
  empresa: { id: number; dsEmpresa: string } | null;
  vlPrevisto: number;
  dtVencimento: string | null;
  aluno: { id: number; nmAluno: string } | null;
  origem: string;
  vencida: boolean;
};

type PaymentMethod = { id: number; dsFormaPagamento: string; boInativo: boolean };

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : 'sem vencimento';

export function CashierDesk() {
  const { showToast } = useToast();

  const [charges, setCharges] = useState<OpenCharge[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [term, setTerm] = useState('');
  const [methodId, setMethodId] = useState('');
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [lastSettled, setLastSettled] = useState<{ id: number; aluno: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  async function loadCharges() {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (companyId) params.set('idEmpresa', companyId);
      if (onlyOverdue) params.set('vencidas', 'true');
      const response = await fetch(`${apiUrl}/payments/open?${params.toString()}`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as cobranças.');
      setCharges((await response.json()) as OpenCharge[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar as cobranças.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAuxiliary() {
    try {
      const [companiesResponse, methodsResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/payment-methods`),
      ]);
      if (companiesResponse.ok) {
        const list = (await companiesResponse.json()) as Company[];
        setCompanies(list.filter((company) => company.boInativo === false));
      }
      if (methodsResponse.ok) {
        const list = (await methodsResponse.json()) as PaymentMethod[];
        const ativas = list.filter((method) => method.boInativo === false);
        setMethods(ativas);
        // Pré-seleciona Pix quando existe: é o que a maior parte das baixas
        // vai ser agora que o aluno paga pelo app do banco.
        const pix = ativas.find((method) => /pix/i.test(method.dsFormaPagamento));
        if (pix) setMethodId(String(pix.id));
      }
    } catch {
      // A tela funciona sem estas listas — elas só refinam o filtro e a baixa.
    }
  }

  useEffect(() => {
    void loadAuxiliary();
  }, []);

  useEffect(() => {
    void loadCharges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, onlyOverdue]);

  // Busca local: a lista já está carregada e quem opera o caixa digita com o
  // comprovante na frente — ida ao servidor a cada tecla só adicionaria espera.
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return charges;
    return charges.filter(
      (charge) =>
        (charge.aluno?.nmAluno ?? '').toLowerCase().includes(needle) ||
        brl(charge.vlPrevisto).includes(needle) ||
        String(charge.vlPrevisto).includes(needle),
    );
  }, [charges, term]);

  const totalAberto = useMemo(
    () => visible.reduce((soma, charge) => soma + charge.vlPrevisto, 0),
    [visible],
  );
  const vencidas = useMemo(() => visible.filter((charge) => charge.vencida).length, [visible]);

  async function settle(charge: OpenCharge) {
    try {
      setSettlingId(charge.id);
      const response = await fetch(`${apiUrl}/payments/${charge.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idFormaPagamento: methodId || null }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível dar baixa.');

      // Guarda a última para permitir desfazer: baixa errada em balcão é
      // comum (aluno de nome parecido, linha de cima), e sem o desfazer a
      // correção voltaria a ser editar a ficha — o caminho que esta tela veio
      // eliminar.
      setLastSettled({ id: charge.id, aluno: charge.aluno?.nmAluno ?? 'aluno' });
      await loadCharges();
      showToast(`Baixa confirmada: ${charge.aluno?.nmAluno ?? 'cobrança'}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao dar baixa.');
    } finally {
      setSettlingId(null);
    }
  }

  async function undoLast() {
    if (!lastSettled) return;
    try {
      const response = await fetch(`${apiUrl}/payments/${lastSettled.id}/unsettle`, {
        method: 'POST',
      });
      if (!response.ok) await getApiError(response, 'Não foi possível desfazer.');
      setLastSettled(null);
      await loadCharges();
      showToast('Baixa desfeita. A cobrança voltou para o aberto.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao desfazer a baixa.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Atendimento</p>
        <h2 className="module-page-title">CAIXA</h2>
      </header>

      <div className="form-view cashier">
        <div className="cashier-toolbar">
          <label className="search-field">
            <span>Empresa</span>
            <select onChange={(event) => setCompanyId(event.target.value)} value={companyId}>
              <option value="">Todas</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.dsEmpresa}
                </option>
              ))}
            </select>
          </label>

          <label className="search-field">
            <span>Forma de pagamento</span>
            <select onChange={(event) => setMethodId(event.target.value)} value={methodId}>
              <option value="">Não informar</option>
              {methods.map((method) => (
                <option key={method.id} value={String(method.id)}>
                  {method.dsFormaPagamento}
                </option>
              ))}
            </select>
          </label>

          <label className="cashier-check">
            <input
              checked={onlyOverdue}
              onChange={(event) => setOnlyOverdue(event.target.checked)}
              type="checkbox"
            />
            <span>Só vencidas</span>
          </label>

          <div className="cashier-counters">
            <div>
              <strong>{visible.length}</strong>
              <span>em aberto</span>
            </div>
            <div className={vencidas > 0 ? 'cashier-overdue' : ''}>
              <strong>{vencidas}</strong>
              <span>vencidas</span>
            </div>
            <div>
              <strong>{brl(totalAberto)}</strong>
              <span>a receber</span>
            </div>
          </div>
        </div>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        {lastSettled ? (
          <div className="cashier-undo" role="status">
            <span>Baixa confirmada para {lastSettled.aluno}.</span>
            <button onClick={() => void undoLast()} type="button">
              <RotateCcw aria-hidden="true" size={13} />
              Desfazer
            </button>
          </div>
        ) : null}

        <label className="cashier-search">
          <Search aria-hidden="true" size={18} />
          <input
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar por nome do aluno ou valor"
            type="search"
            value={term}
          />
        </label>

        {isLoading ? (
          <p className="cashier-empty">Carregando cobranças...</p>
        ) : visible.length === 0 ? (
          <p className="cashier-empty">
            {charges.length === 0
              ? 'Nenhuma cobrança em aberto. Está tudo recebido.'
              : 'Nenhuma cobrança bate com a busca.'}
          </p>
        ) : (
          <ul className="cashier-list">
            {visible.map((charge) => (
              <li className={`cashier-row ${charge.vencida ? 'vencida' : ''}`} key={charge.id}>
                <div className="cashier-who">
                  <strong>{charge.aluno?.nmAluno ?? 'Aluno não identificado'}</strong>
                  <span>
                    {charge.origem}
                    {charge.empresa ? ` · ${charge.empresa.dsEmpresa}` : ''}
                  </span>
                </div>
                <div className="cashier-when">
                  <strong>{brl(charge.vlPrevisto)}</strong>
                  <span>
                    {charge.vencida ? 'venceu em ' : 'vence em '}
                    {data(charge.dtVencimento)}
                  </span>
                </div>
                <button
                  className="cashier-settle"
                  disabled={settlingId === charge.id}
                  onClick={() => void settle(charge)}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" size={15} />
                  {settlingId === charge.id ? 'Confirmando...' : 'Recebi'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
