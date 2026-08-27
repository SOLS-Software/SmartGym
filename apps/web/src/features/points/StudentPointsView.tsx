'use client';

import { useEffect, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type PointsBalance = { idEmpresa: number; dsEmpresa: string; qtDisponivel: number };

type PointsEntry = {
  id: number;
  idEmpresa: number;
  qtPontos: number;
  qtDisponivel: number;
  dsHistorico: string | null;
  dtCadastro: string;
  empresa: { id: number; dsEmpresa: string } | null;
  pontuacao: { id: number; dsPontuacao: string } | null;
  produtoMovimentacao: { id: number; produto: { id: number; dsProduto: string } | null } | null;
  alunoCheckIn: { id: number; dtCadastro: string } | null;
};

/**
 * Texto da linha do extrato. A ordem das perguntas segue a probabilidade: a
 * maioria dos lançamentos é check-in, o resgate é o que o aluno mais procura, e
 * o histórico livre é o que sobra.
 */
function describeEntry(entry: PointsEntry) {
  if (entry.produtoMovimentacao) {
    return `Resgate: ${entry.produtoMovimentacao.produto?.dsProduto ?? 'produto'}`;
  }
  if (entry.alunoCheckIn) {
    return entry.pontuacao?.dsPontuacao ?? 'Check-in na academia';
  }
  if (entry.dsHistorico) return entry.dsHistorico;
  return entry.pontuacao?.dsPontuacao ?? 'Lançamento manual';
}

export function StudentPointsView({
  studentId,
  studentName,
}: {
  studentId: number | null;
  studentName: string;
}) {
  const [saldos, setSaldos] = useState<PointsBalance[]>([]);
  const [lancamentos, setLancamentos] = useState<PointsEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!studentId) {
      setIsLoading(false);
      return;
    }

    void (async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/students/${studentId}/related/points`);
        if (!response.ok) await getApiError(response, 'Não foi possível carregar seus pontos.');
        const data = (await response.json()) as {
          saldos: PointsBalance[];
          lancamentos: PointsEntry[];
        };
        setSaldos(data.saldos);
        setLancamentos(data.lancamentos);
        setFeedback('');
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Erro ao carregar pontos.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [studentId]);

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Minha conta</p>
        <h2 className="module-page-title">MEUS PONTOS</h2>
        <p className="module-page-subtitle">{studentName}</p>
      </header>

      <div className="form-view points-view">
        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        {isLoading ? (
          <p className="points-empty">Carregando seus pontos...</p>
        ) : lancamentos.length === 0 ? (
          <div className="points-empty-state">
            <strong>Você ainda não tem pontos.</strong>
            <p>
              Os pontos entram sozinhos a cada vez que você treina. Se a sua academia já usa o
              programa de fidelidade, o primeiro check-in daqui pra frente já conta.
            </p>
          </div>
        ) : (
          <>
            <section className="points-balances" aria-label="Saldo de pontos">
              {saldos.map((saldo) => (
                <div className="points-balance-card" key={saldo.idEmpresa}>
                  <span className="points-balance-label">{saldo.dsEmpresa || 'Academia'}</span>
                  <strong className="points-balance-value">{saldo.qtDisponivel}</strong>
                  <span className="points-balance-unit">
                    {saldo.qtDisponivel === 1 ? 'ponto disponível' : 'pontos disponíveis'}
                  </span>
                </div>
              ))}
            </section>

            <section className="points-history" aria-label="Extrato de pontos">
              <p className="section-label">Extrato</p>
              <ul className="points-entries">
                {lancamentos.map((entry) => (
                  <li className="points-entry" key={entry.id}>
                    <div className="points-entry-main">
                      <strong>{describeEntry(entry)}</strong>
                      <span>
                        {new Date(entry.dtCadastro).toLocaleDateString('pt-BR')}
                        {saldos.length > 1 && entry.empresa ? ` · ${entry.empresa.dsEmpresa}` : ''}
                      </span>
                    </div>
                    <div className="points-entry-values">
                      <span className={`points-entry-delta ${entry.qtPontos < 0 ? 'debit' : 'credit'}`}>
                        {entry.qtPontos > 0 ? '+' : ''}
                        {entry.qtPontos}
                      </span>
                      {/* Saldo depois deste lançamento: é o que transforma a
                          lista em extrato e responde "de onde veio esse número". */}
                      <span className="points-entry-balance">saldo {entry.qtDisponivel}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
