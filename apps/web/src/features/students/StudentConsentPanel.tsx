'use client';

import { useEffect, useState } from 'react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';

// Captura de consentimento LGPD (art. 8 e art. 11) na ficha do aluno — lado da
// EQUIPE, no cadastro/recepcao, com o titular presente. O backend
// (GET/POST /students/:id/consents) e append-only e ja aceita estas 3
// finalidades; este painel e a captura que faltava para o gate
// (CONSENT_ENFORCEMENT) poder ficar ligado. As CHAVES precisam bater com
// CONSENT_PURPOSES da API. Texto generico v1 — refinar com o juridico; a versao
// vai em dsVersaoTermo para provar O QUE foi consentido.
const TERM_VERSION = 'v1';

type Purpose = { key: string; title: string; desc: string; sensivel?: boolean };

const PURPOSES: Purpose[] = [
  {
    key: 'biometria_facial',
    title: 'Biometria facial',
    desc: 'Reconhecimento do rosto para liberar a catraca. Dado sensivel (art. 11): o titular pode recusar e usar outra forma de acesso.',
    sensivel: true,
  },
  {
    key: 'push',
    title: 'Notificacoes no app',
    desc: 'Avisos push no celular do aluno (treino, cobrancas, recados).',
  },
  {
    key: 'comunicacao_email',
    title: 'Comunicacao por email',
    desc: 'Comunicacoes, avisos e novidades da academia por email.',
  },
];

type ConsentState = { concedido: boolean; em: string; versao: string | null };
type ConsentsResponse = {
  idAluno: number;
  atual: Record<string, ConsentState>;
  historico: unknown[];
};

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export function StudentConsentPanel({ studentId }: { studentId: number | null }) {
  const { showToast } = useToast();
  const [atual, setAtual] = useState<Record<string, ConsentState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/students/${studentId}/consents`);
        if (!response.ok) await getApiError(response, 'Nao foi possivel carregar os consentimentos.');
        const data = (await response.json()) as ConsentsResponse;
        if (!cancelled) setAtual(data.atual ?? {});
      } catch (error) {
        if (!cancelled) showToast(error instanceof Error ? error.message : 'Erro ao carregar consentimentos.', 'error');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function setConsent(key: string, proximo: boolean) {
    if (!studentId || saving) return;
    setSaving(key);
    try {
      const response = await fetch(`${apiUrl}/students/${studentId}/consents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnFinalidade: key, boConcedido: proximo, dsVersaoTermo: TERM_VERSION }),
      });
      if (!response.ok) await getApiError(response, 'Nao foi possivel salvar o consentimento.');
      setAtual((current) => ({
        ...current,
        [key]: { concedido: proximo, em: new Date().toISOString(), versao: TERM_VERSION },
      }));
      showToast(proximo ? 'Consentimento registrado.' : 'Consentimento revogado.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(null);
    }
  }

  if (!studentId) return null;

  return (
    <section aria-label="Consentimentos LGPD do aluno" className="consent-panel">
      <div className="consent-panel-head">
        <p className="section-label">Privacidade · LGPD</p>
        <h3 className="consent-panel-title">Consentimentos</h3>
        <p className="consent-panel-sub">
          Registre com o titular presente. Cada mudanca fica gravada (data, IP, versao do termo {TERM_VERSION}).
        </p>
      </div>

      {isLoading ? (
        <p className="form-hint">Carregando consentimentos...</p>
      ) : (
        <div className="consent-list">
          {PURPOSES.map((p) => {
            const estado = atual[p.key];
            const concedido = estado?.concedido === true;
            return (
              <div className="consent-row" key={p.key}>
                <div className="consent-row-text">
                  <span className="consent-row-title-line">
                    <span className="consent-row-title">{p.title}</span>
                    {p.sensivel ? <span className="consent-badge">Sensivel</span> : null}
                  </span>
                  <span className="consent-row-desc">{p.desc}</span>
                  <span className={concedido ? 'consent-state on' : 'consent-state off'}>
                    {concedido
                      ? `Autorizado${estado?.em ? ` em ${formatDate(estado.em)}` : ''}`
                      : 'Nao autorizado'}
                  </span>
                </div>
                <button
                  className={concedido ? 'btn-secondary' : 'btn-primary'}
                  disabled={saving === p.key}
                  onClick={() => void setConsent(p.key, !concedido)}
                  type="button"
                >
                  {saving === p.key ? '...' : concedido ? 'Revogar' : 'Autorizar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
