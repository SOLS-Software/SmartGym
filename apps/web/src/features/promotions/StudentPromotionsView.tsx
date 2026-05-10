'use client';

import { useEffect, useState } from 'react';
import { formatDateDisplay } from '../../shared/registration/registrationHelpers';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';

type StudentPromotionsViewProps = {
  studentName: string;
};

type NamedRecord = {
  id: number;
  [key: string]: unknown;
};

type PromotionView = {
  id: number;
  dsPromocao: string;
  qtPeriodo: number;
  vlDesconto: number | string | null;
  pcDesconto: number | string | null;
  dtInicio: string | null;
  dtEncerramento: string | null;
  empresa?: NamedRecord | null;
  unidadeTempo?: NamedRecord | null;
  promocaoPlanos?: Array<
    NamedRecord & {
      qtDisponivel?: number | null;
      dtInicio?: string | null;
      dtEncerramento?: string | null;
      empresa?: NamedRecord | null;
      plano?: NamedRecord | null;
    }
  >;
  promocaoProdutos?: Array<
    NamedRecord & {
      qtDisponivel?: number | null;
      empresa?: NamedRecord | null;
      produto?: NamedRecord | null;
    }
  >;
};

function getText(record: NamedRecord | null | undefined, key: string, fallback = '-') {
  const value = record?.[key];
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return '';
  return Number(value).toLocaleString('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  });
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.filter((name) => name && name !== '-')));
}

function getDiscountLabel(promotion: PromotionView) {
  const percent = Number(promotion.pcDesconto ?? 0);
  const money = formatMoney(promotion.vlDesconto);

  if (percent > 0 && money) return `${percent}% + ${money}`;
  if (percent > 0) return `${percent}%`;
  if (money) return money;
  return 'Beneficio especial';
}

export function StudentPromotionsView({ studentName }: StudentPromotionsViewProps) {
  const [promotions, setPromotions] = useState<PromotionView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    void loadPromotions();
  }, []);

  async function loadPromotions() {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/promotions?currentOnly=true&includeDetails=true`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar as promocoes vigentes.');
      }

      setPromotions((await response.json()) as PromotionView[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar promocoes.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="form-view student-promotions-view">
      <div className="form-heading student-promotions-heading">
        <p className="section-label">Promocoes vigentes</p>
        <h2>{studentName}</h2>
        <p>Confira as promocoes ativas da academia, quais planos elas atingem e seus beneficios.</p>
      </div>

      {feedback ? <div className="form-feedback">{feedback}</div> : null}

      {isLoading ? <div className="form-hint">Carregando promocoes...</div> : null}

      {!isLoading && promotions.length === 0 ? (
        <div className="form-hint">Nenhuma promocao vigente encontrada.</div>
      ) : null}

      <section className="student-promotion-list" aria-label="Promocoes vigentes">
        {promotions.map((promotion) => {
          const plans = uniqueNames(
            promotion.promocaoPlanos?.map((item) => getText(item.plano, 'dsPlano')) ?? [],
          );
          const products = uniqueNames(
            promotion.promocaoProdutos?.map((item) => getText(item.produto, 'dsProduto')) ?? [],
          );
          const branches = uniqueNames([
            getText(promotion.empresa, 'dsEmpresa', ''),
            ...(promotion.promocaoPlanos?.map((item) => getText(item.empresa, 'dsEmpresa', '')) ?? []),
            ...(promotion.promocaoProdutos?.map((item) => getText(item.empresa, 'dsEmpresa', '')) ?? []),
          ]);
          const periodUnit = getText(promotion.unidadeTempo, 'dsUnidadeTempo', '');

          return (
            <article className="student-promotion-card" key={promotion.id}>
              <div className="student-promotion-card-header">
                <div>
                  <span className="section-label">Promocao</span>
                  <h3>{promotion.dsPromocao}</h3>
                </div>
                <span className="status-badge active">Vigente</span>
              </div>

              <div className="student-promotion-summary">
                <div>
                  <span>Desconto</span>
                  <strong>{getDiscountLabel(promotion)}</strong>
                </div>
                <div>
                  <span>Periodo</span>
                  <strong>
                    {promotion.qtPeriodo > 0
                      ? `${promotion.qtPeriodo} ${periodUnit || 'periodo(s)'}`
                      : '-'}
                  </strong>
                </div>
                <div>
                  <span>Inicio</span>
                  <strong>{promotion.dtInicio ? formatDateDisplay(promotion.dtInicio) : '-'}</strong>
                </div>
                <div>
                  <span>Encerramento</span>
                  <strong>
                    {promotion.dtEncerramento ? formatDateDisplay(promotion.dtEncerramento) : 'Sem data'}
                  </strong>
                </div>
              </div>

              <div className="student-promotion-detail-grid">
                <section>
                  <h4>Planos atingidos</h4>
                  <div className="student-promotion-chip-list">
                    {plans.length > 0 ? (
                      plans.map((plan) => <span key={plan}>{plan}</span>)
                    ) : (
                      <p>Promocao geral da academia.</p>
                    )}
                  </div>
                </section>

                <section>
                  <h4>Beneficios</h4>
                  <div className="student-promotion-chip-list">
                    <span>{getDiscountLabel(promotion)}</span>
                    {products.map((product) => <span key={product}>Produto: {product}</span>)}
                    {products.length === 0 && Number(promotion.pcDesconto ?? 0) === 0 && !formatMoney(promotion.vlDesconto) ? (
                      <p>Beneficio definido pela academia.</p>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h4>Filiais</h4>
                  <div className="student-promotion-chip-list">
                    {branches.length > 0 ? (
                      branches.map((branch) => <span key={branch}>{branch}</span>)
                    ) : (
                      <p>Todas as filiais participantes.</p>
                    )}
                  </div>
                </section>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
