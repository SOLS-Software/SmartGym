'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { useToast } from '../../shared/components/Toast';
import type { Company } from '../../shared/registration/registrationTypes';

// Contas de recebimento — por onde a academia recebe o dinheiro do aluno.
//
// A conta é do cliente. O dinheiro vai direto do aluno para a conta dele; o
// SmartGym só faz a ponte. Por isso esta tela guarda dado do cliente e nenhum
// valor passa por aqui.
//
// O QUE ESTA TELA NUNCA MOSTRA: a chave Pix e a credencial em claro. A API
// devolve só a máscara, então nem um erro de permissão nem o DevTools revelam
// o segredo — o campo fica vazio na edição e só grava quando alguém digita algo
// novo. Deixar em branco mantém o que já está salvo.

type PaymentAccount = {
  id: number;
  idEmpresa: number | null;
  empresa: { id: number; dsEmpresa: string } | null;
  dsConta: string;
  cnProvedor: 'pix_manual' | 'asaas' | 'mercadopago';
  cnAmbiente: 'sandbox' | 'producao';
  cnTipoChavePix: string | null;
  nmBeneficiario: string | null;
  dsCidade: string | null;
  boPadrao: boolean;
  boInativo: boolean;
  chavePixMascarada: string | null;
  credencialMascarada: string | null;
  temChavePix: boolean;
  temCredencial: boolean;
  caminhoWebhook: string | null;
  urlWebhook: string | null;
  tokenWebhook: string | null;
};

type WebhookEvent = {
  id: number;
  cnTipoEvento: string;
  cnStatus: 'recebido' | 'processado' | 'ignorado' | 'recusado';
  dsResultado: string | null;
  idPagamento: number | null;
  dtCadastro: string;
  contaRecebimento: { id: number; dsConta: string } | null;
};

/** O que cada status quer dizer para quem não escreveu o código. */
const EVENT_LABEL: Record<WebhookEvent['cnStatus'], string> = {
  processado: 'deu baixa',
  ignorado: 'não muda nada',
  recusado: 'não confere',
  recebido: 'aguardando confirmação',
};

const PROVEDORES: Array<{ value: PaymentAccount['cnProvedor']; label: string; ajuda: string }> = [
  {
    value: 'pix_manual',
    label: 'Pix (chave própria)',
    ajuda: 'O aluno paga pelo banco e a recepção confirma. Sem taxa de integração.',
  },
  {
    value: 'asaas',
    label: 'Asaas',
    ajuda: 'Pix, boleto e cartão com baixa automática. Exige a chave de API da conta.',
  },
  {
    value: 'mercadopago',
    label: 'Mercado Pago',
    ajuda: 'Pix e cartão. Exige o access token da conta.',
  },
];

const TIPOS_CHAVE = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Aleatória' },
];

function providerLabel(value: string) {
  return PROVEDORES.find((p) => p.value === value)?.label ?? value;
}

export function PaymentAccountRegistration() {
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  const [dsConta, setDsConta] = useState('');
  const [cnProvedor, setCnProvedor] = useState<PaymentAccount['cnProvedor']>('pix_manual');
  const [cnAmbiente, setCnAmbiente] = useState<PaymentAccount['cnAmbiente']>('producao');
  const [idEmpresa, setIdEmpresa] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [cnTipoChavePix, setCnTipoChavePix] = useState('cpf');
  const [nmBeneficiario, setNmBeneficiario] = useState('');
  const [dsCidade, setDsCidade] = useState('');
  const [credencial, setCredencial] = useState('');
  const [boPadrao, setBoPadrao] = useState(false);

  const selected = useMemo(
    () => accounts.find((a) => a.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const isPix = cnProvedor === 'pix_manual';

  async function loadAccounts() {
    try {
      const response = await fetch(`${apiUrl}/payment-accounts`);
      if (!response.ok) await getApiError(response, 'Não foi possível carregar as contas.');
      setAccounts((await response.json()) as PaymentAccount[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar as contas.');
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);
      if (!response.ok) return;
      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === false));
    } catch {
      // Sem a lista, a conta ainda pode ser cadastrada para a rede inteira.
    }
  }

  // Eventos recebidos do provedor. Falha em silêncio: a tela é de cadastro
  // antes de ser de diagnóstico.
  async function loadEvents() {
    try {
      const response = await fetch(`${apiUrl}/payment-accounts/events?limit=15`);
      if (!response.ok) return;
      setEvents((await response.json()) as WebhookEvent[]);
    } catch {
      // silencioso de propósito — ver comentário acima
    }
  }

  async function copyWebhook(account: PaymentAccount) {
    const texto = account.urlWebhook ?? account.caminhoWebhook ?? '';
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiedId(account.id);
      showToast('Endereço copiado.');
    } catch {
      // Clipboard bloqueado: o endereço continua na tela para copiar à mão.
      setCopiedId(null);
    }
  }

  useEffect(() => {
    void loadAccounts();
    void loadCompanies();
    void loadEvents();
  }, []);

  function resetForm() {
    setDsConta('');
    setCnProvedor('pix_manual');
    setCnAmbiente('producao');
    setIdEmpresa('');
    setChavePix('');
    setCnTipoChavePix('cpf');
    setNmBeneficiario('');
    setDsCidade('');
    setCredencial('');
    setBoPadrao(false);
  }

  function handleNew() {
    setSelectedId(null);
    setIsCreating(true);
    resetForm();
    setFeedback('');
    setIsDrawerOpen(true);
  }

  function handleSelect(account: PaymentAccount) {
    setSelectedId(account.id);
    setIsCreating(false);
    setDsConta(account.dsConta);
    setCnProvedor(account.cnProvedor);
    setCnAmbiente(account.cnAmbiente);
    setIdEmpresa(account.idEmpresa ? String(account.idEmpresa) : '');
    setCnTipoChavePix(account.cnTipoChavePix ?? 'cpf');
    setNmBeneficiario(account.nmBeneficiario ?? '');
    setDsCidade(account.dsCidade ?? '');
    setBoPadrao(account.boPadrao);
    // Segredos entram vazios: a API só devolve máscara, e preencher o campo com
    // ela faria o operador salvar a máscara por cima do valor real.
    setChavePix('');
    setCredencial('');
    setFeedback('');
    setIsDrawerOpen(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dsConta.trim().length < 2) {
      setFeedback('Dê um nome para a conta.');
      return;
    }

    try {
      setIsSaving(true);
      setFeedback('');

      const payload: Record<string, unknown> = {
        dsConta: dsConta.trim(),
        cnProvedor,
        cnAmbiente,
        idEmpresa: idEmpresa || null,
        boPadrao,
        nmBeneficiario: nmBeneficiario.trim() || null,
        dsCidade: dsCidade.trim() || null,
      };

      // Campo de segredo só vai no corpo quando foi digitado. Ausente = a API
      // mantém o que está gravado; string vazia apagaria.
      if (chavePix.trim()) {
        payload.chavePix = chavePix.trim();
        payload.cnTipoChavePix = cnTipoChavePix;
      }
      if (credencial.trim()) payload.credencial = credencial.trim();

      const response = await fetch(
        isCreating ? `${apiUrl}/payment-accounts` : `${apiUrl}/payment-accounts/${selectedId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) await getApiError(response, 'Não foi possível salvar a conta.');

      await loadAccounts();
      setIsDrawerOpen(false);
      showToast(isCreating ? 'Conta cadastrada.' : 'Conta atualizada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar a conta.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleStatus(account: PaymentAccount) {
    try {
      const response = await fetch(`${apiUrl}/payment-accounts/${account.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boInativo: !account.boInativo }),
      });
      if (!response.ok) await getApiError(response, 'Não foi possível alterar o status.');
      await loadAccounts();
      showToast(account.boInativo ? 'Conta reativada.' : 'Conta desativada.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar o status.');
    }
  }

  return (
    <>
      <header className="module-page-header">
        <p className="section-label">Empresa</p>
        <h2 className="module-page-title">CONTAS DE RECEBIMENTO</h2>
      </header>

      <div className="form-view billing">
        <p className="billing-intro">
          Onde o dinheiro dos alunos cai. A conta é da academia — o SmartGym só faz a
          ponte, e nenhum valor passa por nós.
        </p>

        {feedback ? <div className="form-feedback">{feedback}</div> : null}

        <div className="billing-toolbar">
          <button className="new-button" onClick={handleNew} type="button">
            <Plus size={16} />
            Nova conta
          </button>
        </div>

        {events.length > 0 ? (
          <section className="billing-events" aria-label="Eventos recebidos">
            <p className="section-label">Últimos eventos do provedor</p>
            {/* Existe para responder "o pagamento não deu baixa, por quê?".
                Sem este log, essa pergunta não tem resposta possível. */}
            <ul>
              {events.map((event) => (
                <li className={`billing-event ${event.cnStatus}`} key={event.id}>
                  <span className="billing-event-when">
                    {new Date(event.dtCadastro).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="billing-event-type">{event.cnTipoEvento || 'sem tipo'}</span>
                  <span className="billing-event-status">{EVENT_LABEL[event.cnStatus]}</span>
                  <span className="billing-event-why">{event.dsResultado ?? ''}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {accounts.length === 0 ? (
          <p className="billing-empty">
            Nenhuma conta cadastrada. Enquanto não houver uma, a cobrança continua sendo
            registrada à mão pela recepção.
          </p>
        ) : (
          <ul className="billing-list">
            {accounts.map((account) => (
              <li
                className={`billing-card ${account.boInativo ? 'inativa' : ''}`}
                key={account.id}
              >
                <div className="billing-card-main">
                  <div className="billing-card-head">
                    <strong>{account.dsConta}</strong>
                    {account.boPadrao ? <span className="billing-tag padrao">padrão</span> : null}
                    {account.cnAmbiente === 'sandbox' ? (
                      /* Sandbox precisa gritar: uma conta de teste esquecida como
                         padrão significa cobrança que nunca vira dinheiro. */
                      <span className="billing-tag sandbox">sandbox</span>
                    ) : null}
                    {account.boInativo ? <span className="billing-tag off">inativa</span> : null}
                  </div>

                  <span className="billing-card-sub">
                    {providerLabel(account.cnProvedor)} ·{' '}
                    {account.empresa ? account.empresa.dsEmpresa : 'todas as unidades'}
                  </span>

                  {/* Endereço do webhook: é o que a academia cola no painel do
                      provedor. Sem ele visível, a integração fica pronta e
                      desligada — e ninguém descobre por quê. */}
                  {account.caminhoWebhook ? (
                    <div className="billing-webhook">
                      <span className="billing-webhook-label">Webhook</span>
                      <code>{account.urlWebhook ?? account.caminhoWebhook}</code>
                      <button onClick={() => void copyWebhook(account)} type="button">
                        {copiedId === account.id ? 'Copiado' : 'Copiar'}
                      </button>
                      {!account.urlWebhook ? (
                        <span className="billing-webhook-hint">
                          Prefixe com o endereço público da sua API (defina API_PUBLIC_URL para
                          o sistema montar sozinho).
                        </span>
                      ) : null}
                      <span className="billing-webhook-hint">
                        No painel do provedor, use este endereço e cole o mesmo token no campo
                        de autenticação.
                      </span>
                    </div>
                  ) : null}

                  <div className="billing-secrets">
                    {account.temChavePix ? (
                      <span>
                        <KeyRound aria-hidden="true" size={13} />
                        Chave Pix {account.chavePixMascarada}
                      </span>
                    ) : null}
                    {account.temCredencial ? (
                      <span>
                        <ShieldCheck aria-hidden="true" size={13} />
                        Credencial {account.credencialMascarada}
                      </span>
                    ) : null}
                    {!account.temChavePix && !account.temCredencial ? (
                      <span className="billing-missing">
                        Sem chave nem credencial — a conta não consegue cobrar nada ainda.
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="billing-card-actions">
                  <button
                    aria-label={`Editar ${account.dsConta}`}
                    className="grid-edit-button"
                    onClick={() => handleSelect(account)}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleToggleStatus(account)}
                    type="button"
                  >
                    {account.boInativo ? 'Reativar' : 'Desativar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RegistrationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={isCreating ? 'Nova conta de recebimento' : 'Editar conta de recebimento'}
      >
        <form className="drawer-fields" onSubmit={handleSave}>
          {feedback ? (
            <div className="form-feedback" style={{ flex: '1 1 100%' }}>
              {feedback}
            </div>
          ) : null}

          <div className="field field-size-full">
            <label htmlFor="dsConta">Nome da conta *</label>
            <input
              id="dsConta"
              maxLength={120}
              onChange={(e) => setDsConta(e.target.value)}
              placeholder="Ex: Pix da matriz"
              required
              type="text"
              value={dsConta}
            />
          </div>

          <div className="field field-size-md">
            <label htmlFor="cnProvedor">Como recebe</label>
            <select
              id="cnProvedor"
              onChange={(e) => setCnProvedor(e.target.value as PaymentAccount['cnProvedor'])}
              value={cnProvedor}
            >
              {PROVEDORES.map((provedor) => (
                <option key={provedor.value} value={provedor.value}>
                  {provedor.label}
                </option>
              ))}
            </select>
            <span className="form-hint">
              {PROVEDORES.find((p) => p.value === cnProvedor)?.ajuda}
            </span>
          </div>

          <div className="field field-size-md">
            <label htmlFor="idEmpresa">Unidade</label>
            <select id="idEmpresa" onChange={(e) => setIdEmpresa(e.target.value)} value={idEmpresa}>
              <option value="">Todas as unidades</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.dsEmpresa}
                </option>
              ))}
            </select>
            <span className="form-hint">
              Deixe em &quot;todas&quot; se a rede recebe numa conta só. Escolha a unidade
              quando cada filial tem CNPJ e conta próprios.
            </span>
          </div>

          {isPix ? (
            <>
              <div className="field field-size-sm">
                <label htmlFor="cnTipoChavePix">Tipo da chave</label>
                <select
                  id="cnTipoChavePix"
                  onChange={(e) => setCnTipoChavePix(e.target.value)}
                  value={cnTipoChavePix}
                >
                  {TIPOS_CHAVE.map((tipo) => (
                    <option key={tipo.value} value={tipo.value}>
                      {tipo.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field field-size-md">
                <label htmlFor="chavePix">Chave Pix</label>
                <input
                  autoComplete="off"
                  id="chavePix"
                  maxLength={200}
                  onChange={(e) => setChavePix(e.target.value)}
                  placeholder={
                    selected?.temChavePix
                      ? `Cadastrada (${selected.chavePixMascarada}) — deixe vazio para manter`
                      : 'Chave da conta que vai receber'
                  }
                  type="text"
                  value={chavePix}
                />
              </div>

              <div className="field field-size-md">
                <label htmlFor="nmBeneficiario">Nome do beneficiário</label>
                <input
                  id="nmBeneficiario"
                  maxLength={25}
                  onChange={(e) => setNmBeneficiario(e.target.value)}
                  placeholder="Como aparece na conta"
                  type="text"
                  value={nmBeneficiario}
                />
                <span className="form-hint">
                  Até 25 caracteres — é o limite do padrão Pix do Banco Central.
                </span>
              </div>

              <div className="field field-size-sm">
                <label htmlFor="dsCidade">Cidade</label>
                <input
                  id="dsCidade"
                  maxLength={15}
                  onChange={(e) => setDsCidade(e.target.value)}
                  type="text"
                  value={dsCidade}
                />
              </div>
            </>
          ) : (
            <>
              <div className="field field-size-md">
                <label htmlFor="credencial">Chave de API / token</label>
                <input
                  autoComplete="off"
                  id="credencial"
                  maxLength={400}
                  onChange={(e) => setCredencial(e.target.value)}
                  placeholder={
                    selected?.temCredencial
                      ? `Cadastrada (${selected.credencialMascarada}) — deixe vazio para manter`
                      : 'Cole a credencial da conta'
                  }
                  type="password"
                  value={credencial}
                />
                <span className="form-hint">
                  Guardada criptografada e nunca devolvida por completo — nem para esta
                  tela. Para trocar, digite a nova.
                </span>
              </div>

              <div className="field field-size-sm">
                <label htmlFor="cnAmbiente">Ambiente</label>
                <select
                  id="cnAmbiente"
                  onChange={(e) => setCnAmbiente(e.target.value as PaymentAccount['cnAmbiente'])}
                  value={cnAmbiente}
                >
                  <option value="producao">Produção</option>
                  <option value="sandbox">Sandbox (teste)</option>
                </select>
              </div>
            </>
          )}

          <div className="field field-size-full">
            <label className="billing-check" htmlFor="boPadrao">
              <input
                checked={boPadrao}
                id="boPadrao"
                onChange={(e) => setBoPadrao(e.target.checked)}
                type="checkbox"
              />
              <span>Usar esta conta por padrão nas cobranças novas</span>
            </label>
          </div>

          <div className="drawer-actions">
            <button disabled={isSaving} type="submit">
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </RegistrationDrawer>
    </>
  );
}
