'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company, Product } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { useToast } from '../../shared/components/Toast';
import { ConfirmDialog } from '../../shared/components/ConfirmDialog';

type Student = { id: number; nmAluno: string; boInativo: boolean };

type PaymentMethod = { id: number; dsFormaPagamento: string; boInativo: boolean };

type Sale = {
  id: number;
  idProduto: number;
  idAluno: number | null;
  qtMovimentada: number;
  vlUnitario: string | number | null;
  qtDisponivel: number;
  dtCadastro: string;
  boInativo: boolean;
  produto?: { id: number; dsProduto: string } | null;
  aluno?: { id: number; nmAluno: string } | null;
  pagamentos?: Array<{ id: number; vlPrevisto: string | number; vlPago: string | number | null }>;
  alunoPontuacoes?: Array<{ id: number; qtPontos: number }>;
};

type PointsBalance = { idEmpresa: number; dsEmpresa: string; qtDisponivel: number };

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SaleRegistration() {
  const { showToast } = useToast();
  const productSelectRef = useRef<HTMLSelectElement | null>(null);
  // Venda a cancelar. O dialogo e controlado (padrao do projeto), entao o alvo
  // fica no estado ate a pessoa confirmar.
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [idProduto, setIdProduto] = useState('');
  const [idAluno, setIdAluno] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [vlUnitario, setVlUnitario] = useState('');
  const [pagarComPontos, setPagarComPontos] = useState(false);
  const [pago, setPago] = useState(true);
  const [idFormaPagamento, setIdFormaPagamento] = useState('');
  const [saldo, setSaldo] = useState<number | null>(null);

  const produtoSelecionado = products.find((product) => String(product.id) === idProduto) ?? null;
  const quantidadeNumero = Number(quantidade || 0);

  const totalDinheiro = useMemo(
    () => Number(vlUnitario || 0) * quantidadeNumero,
    [vlUnitario, quantidadeNumero],
  );
  const totalPontos = (produtoSelecionado?.qtPontosResgate ?? 0) * quantidadeNumero;

  const podeResgatar = Boolean(produtoSelecionado?.qtPontosResgate);
  const saldoInsuficiente = pagarComPontos && saldo !== null && saldo < totalPontos;
  const estoqueInsuficiente =
    produtoSelecionado !== null && quantidadeNumero > produtoSelecionado.qtEstoque;

  const filteredSales = sales.filter((sale) => {
    const termo = searchTerm.toLowerCase();
    return (
      (sale.produto?.dsProduto ?? '').toLowerCase().includes(termo) ||
      (sale.aluno?.nmAluno ?? '').toLowerCase().includes(termo)
    );
  });

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as empresas.');
      const data = (await response.json()) as Company[];
      const ativas = data.filter((company) => company.boInativo === false);
      setCompanies(ativas);
      if (ativas.length === 1 && ativas[0]) setSelectedCompanyId(ativas[0].id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar empresas.');
    }
  }

  async function loadLookups() {
    try {
      const [productsResponse, studentsResponse, methodsResponse] = await Promise.all([
        fetch(`${apiUrl}/products`),
        fetch(`${apiUrl}/students`),
        fetch(`${apiUrl}/payment-methods`),
      ]);

      if (productsResponse.ok) {
        const data = (await productsResponse.json()) as Product[];
        setProducts(data.filter((product) => product.boInativo === false));
      }
      if (studentsResponse.ok) {
        const data = (await studentsResponse.json()) as Student[];
        setStudents(data.filter((student) => student.boInativo === false));
      }
      if (methodsResponse.ok) {
        const data = (await methodsResponse.json()) as PaymentMethod[];
        setPaymentMethods(data.filter((method) => method.boInativo === false));
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadSales(companyId = selectedCompanyId) {
    if (!companyId) {
      setSales([]);
      return;
    }
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/companies/${companyId}/children/sales`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as vendas.');
      setSales((await response.json()) as Sale[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar vendas.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    void loadLookups();
  }, []);

  useEffect(() => {
    void loadSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  // Saldo de pontos do aluno escolhido. Carregado sempre (não só quando o
  // resgate está marcado) porque saber que o aluno TEM pontos é o que faz o
  // operador lembrar de oferecer o resgate.
  useEffect(() => {
    if (!idAluno || !selectedCompanyId) {
      setSaldo(null);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/students/${idAluno}/related/points`);
        if (!response.ok) {
          setSaldo(null);
          return;
        }
        const data = (await response.json()) as { saldos: PointsBalance[] };
        const daFilial = data.saldos.find((item) => item.idEmpresa === selectedCompanyId);
        setSaldo(daFilial?.qtDisponivel ?? 0);
      } catch {
        setSaldo(null);
      }
    })();
  }, [idAluno, selectedCompanyId]);

  // Preço sugerido do cadastro entra sozinho ao trocar de produto.
  useEffect(() => {
    if (!produtoSelecionado) return;
    setVlUnitario(
      produtoSelecionado.vlVenda === null || produtoSelecionado.vlVenda === undefined
        ? ''
        : String(produtoSelecionado.vlVenda),
    );
    if (!produtoSelecionado.qtPontosResgate) setPagarComPontos(false);
  }, [produtoSelecionado]);

  function handleNew() {
    if (!selectedCompanyId) {
      setFeedback('Selecione a empresa antes de registrar uma venda.');
      return;
    }
    setIdProduto('');
    setIdAluno('');
    setQuantidade('1');
    setVlUnitario('');
    setPagarComPontos(false);
    setPago(true);
    setIdFormaPagamento('');
    setSaldo(null);
    setFeedback('');
    setIsDrawerOpen(true);
    setTimeout(() => productSelectRef.current?.focus(), 0);
  }

  async function handleCancelSale() {
    const sale = saleToCancel;
    if (!sale) return;
    setSaleToCancel(null);

    try {
      const response = await fetch(
        `${apiUrl}/companies/${selectedCompanyId}/children/sales/${sale.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boInativo: true }),
        },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível cancelar a venda.');
      await loadSales();
      showToast('Venda cancelada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao cancelar venda.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) return;

    try {
      setIsSaving(true);
      const response = await fetch(`${apiUrl}/companies/${selectedCompanyId}/children/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idProduto: Number(idProduto),
          idAluno: Number(idAluno),
          qtMovimentada: quantidadeNumero,
          vlUnitario: pagarComPontos ? 0 : Number(vlUnitario || 0),
          boResgatePontos: pagarComPontos,
          boPago: pagarComPontos ? false : pago,
          idFormaPagamento: idFormaPagamento ? Number(idFormaPagamento) : null,
        }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível registrar a venda.');

      await Promise.all([loadSales(), loadLookups()]);
      showToast(pagarComPontos ? 'Resgate registrado.' : 'Venda registrada.');
      setIsDrawerOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao registrar venda.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Estoque</p>
        <h2 className="module-page-title">VENDAS NO BALCÃO</h2>
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

          <RegistrationGrid<Sale>
            ariaLabel="Vendas registradas"
            label="Vendas"
            columns={[
              {
                label: 'Data',
                render: (s) => new Date(s.dtCadastro).toLocaleDateString('pt-BR'),
                sortValue: (s) => s.dtCadastro,
              },
              { label: 'Produto', render: (s) => s.produto?.dsProduto ?? '-' },
              { label: 'Aluno', render: (s) => s.aluno?.nmAluno ?? '-' },
              { label: 'Qtd', render: (s) => String(s.qtMovimentada) },
              {
                label: 'Total',
                render: (s) => {
                  const pontos = s.alunoPontuacoes?.[0];
                  // Resgate não tem valor em dinheiro: mostra o que de fato
                  // saiu do aluno, que foram pontos.
                  if (pontos) return `${Math.abs(pontos.qtPontos)} pts`;
                  return money(Number(s.vlUnitario ?? 0) * s.qtMovimentada);
                },
              },
              {
                label: 'Situação',
                render: (s) => {
                  if (s.boInativo) {
                    return <span className="status-badge inactive">Cancelada</span>;
                  }
                  if (s.alunoPontuacoes?.length) {
                    return <span className="status-badge active">Resgate</span>;
                  }
                  const pagamento = s.pagamentos?.[0];
                  const quitado = pagamento && Number(pagamento.vlPago ?? 0) > 0;
                  return (
                    <span className={`status-badge ${quitado ? 'active' : 'pending'}`}>
                      {quitado ? 'Pago' : 'Em aberto'}
                    </span>
                  );
                },
              },
            ]}
            records={filteredSales}
            isLoading={isLoading}
            selectedId={null}
            onSelect={(sale) => {
              if (!sale.boInativo) setSaleToCancel(sale);
            }}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar por produto ou aluno"
            onNew={handleNew}
            newDisabled={!selectedCompanyId}
            emptyMessage={
              selectedCompanyId
                ? 'Nenhuma venda registrada nesta empresa.'
                : 'Selecione uma empresa para ver as vendas.'
            }
          />
        </section>

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title="Nova Venda"
          onClose={() => setIsDrawerOpen(false)}
        >
          <form className="drawer-fields" onSubmit={handleSave}>
            {feedback ? (
              <div className="form-feedback" style={{ flex: '1 1 100%' }}>
                {feedback}
              </div>
            ) : null}

            <RegistrationField htmlFor="vendaProduto" label="Produto" size="lg">
              <select
                id="vendaProduto"
                onChange={(event) => setIdProduto(event.target.value)}
                ref={productSelectRef}
                required
                value={idProduto}
              >
                <option value="">Selecione</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.dsProduto} ({product.qtEstoque} em estoque)
                  </option>
                ))}
              </select>
            </RegistrationField>

            <RegistrationField htmlFor="vendaAluno" label="Aluno" size="lg">
              <select
                id="vendaAluno"
                onChange={(event) => setIdAluno(event.target.value)}
                required
                value={idAluno}
              >
                <option value="">Selecione</option>
                {students.map((student) => (
                  <option key={student.id} value={String(student.id)}>
                    {student.nmAluno}
                  </option>
                ))}
              </select>
            </RegistrationField>

            <RegistrationField
              error={estoqueInsuficiente ? 'Quantidade maior que o estoque disponível.' : undefined}
              htmlFor="vendaQuantidade"
              label="Quantidade"
              size="sm"
              touched
            >
              <input
                id="vendaQuantidade"
                min="1"
                onChange={(event) => setQuantidade(event.target.value)}
                required
                type="number"
                value={quantidade}
              />
            </RegistrationField>

            {saldo !== null ? (
              <div className="sale-balance" style={{ flex: '1 1 100%' }}>
                Saldo de pontos deste aluno nesta filial: <strong>{saldo} pts</strong>
                {podeResgatar ? ` · este produto custa ${totalPontos} pts` : ' · produto sem preço em pontos'}
              </div>
            ) : null}

            {podeResgatar ? (
              <RegistrationField htmlFor="vendaResgate" label="Forma de pagamento" size="full">
                <div className="sale-payment-toggle" id="vendaResgate">
                  <label>
                    <input
                      checked={!pagarComPontos}
                      name="formaPagamentoVenda"
                      onChange={() => setPagarComPontos(false)}
                      type="radio"
                    />
                    <span>Dinheiro</span>
                  </label>
                  <label>
                    <input
                      checked={pagarComPontos}
                      name="formaPagamentoVenda"
                      onChange={() => setPagarComPontos(true)}
                      type="radio"
                    />
                    <span>Resgatar com pontos ({totalPontos} pts)</span>
                  </label>
                </div>
              </RegistrationField>
            ) : null}

            {!pagarComPontos ? (
              <>
                <RegistrationField htmlFor="vendaValor" label="Valor unitário" size="sm">
                  <input
                    id="vendaValor"
                    min="0"
                    onChange={(event) => setVlUnitario(event.target.value)}
                    step="0.01"
                    type="number"
                    value={vlUnitario}
                  />
                </RegistrationField>

                <RegistrationField htmlFor="vendaForma" label="Forma" size="md">
                  <select
                    id="vendaForma"
                    onChange={(event) => setIdFormaPagamento(event.target.value)}
                    value={idFormaPagamento}
                  >
                    <option value="">Não informada</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={String(method.id)}>
                        {method.dsFormaPagamento}
                      </option>
                    ))}
                  </select>
                </RegistrationField>

                <RegistrationField
                  hint="Em aberto entra como pendência do aluno, junto das mensalidades."
                  htmlFor="vendaPago"
                  label="Situação"
                  size="md"
                >
                  <button
                    aria-pressed={pago}
                    className={`status-toggle ${pago ? 'active' : ''}`}
                    id="vendaPago"
                    onClick={() => setPago((current) => !current)}
                    type="button"
                  >
                    {pago ? 'Pago agora' : 'Deixar em aberto'}
                  </button>
                </RegistrationField>
              </>
            ) : null}

            <div className="sale-total" style={{ flex: '1 1 100%' }}>
              <span>Total</span>
              <strong>{pagarComPontos ? `${totalPontos} pts` : money(totalDinheiro)}</strong>
            </div>

            {saldoInsuficiente ? (
              <div className="form-feedback" style={{ flex: '1 1 100%' }}>
                Saldo insuficiente: o aluno tem {saldo} ponto(s) e o resgate pede {totalPontos}.
              </div>
            ) : null}

            <div className="form-actions" style={{ flex: '1 1 100%' }}>
              <button
                className="secondary-button"
                onClick={() => setIsDrawerOpen(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                disabled={isSaving || saldoInsuficiente || estoqueInsuficiente || !idProduto || !idAluno}
                type="submit"
              >
                <Save size={16} />
                {isSaving ? 'Registrando...' : pagarComPontos ? 'Registrar resgate' : 'Registrar venda'}
              </button>
            </div>
          </form>
        </RegistrationDrawer>
      </div>

      <ConfirmDialog
        open={saleToCancel !== null}
        title="Cancelar venda?"
        message={
          saleToCancel
            ? `${saleToCancel.qtMovimentada}x ${saleToCancel.produto?.dsProduto ?? 'produto'}: o produto volta para o estoque, a cobrança é cancelada e os pontos resgatados voltam para o aluno.`
            : ''
        }
        confirmLabel="Cancelar venda"
        variant="danger"
        onConfirm={() => void handleCancelSale()}
        onCancel={() => setSaleToCancel(null)}
      />
    </>
  );
}
