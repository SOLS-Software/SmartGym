'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { apiFetch as fetch, apiUrl } from '../../shared/api/apiFetch';

// Formulário público de interesse — a porta de entrada da academia.
//
// É a única tela do sistema que roda SEM sessão. Por isso ela não carrega
// nenhuma lista: nem de unidades, nem de planos. Um formulário aberto que
// enumera as filiais e a tabela de preços entrega a estrutura da academia a
// quem só abriu a página, e nada disso é necessário para alguém dizer "quero
// treinar aí". A recepção completa o resto no atendimento.
//
// A ACADEMIA É RESOLVIDA PELO DOMÍNIO, no servidor: a página só informa de
// onde foi aberta (window.location.hostname). Se mandasse um idCliente,
// qualquer um na internet escolheria em qual academia despejar cadastro falso
// trocando um número.

type Theme = {
  dsCliente?: string;
  corPrimaria?: string;
  logoUrl?: string | null;
};

export default function InterestPage() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const hostname = window.location.hostname;
    void fetch(`${apiUrl}/auth/theme?url=${encodeURIComponent(hostname)}`)
      .then(async (response) => {
        if (response.status === 204 || !response.ok) return;
        const data = (await response.json()) as Theme;
        setTheme(data);
        if (data.corPrimaria) {
          document.documentElement.style.setProperty('--color-primary', data.corPrimaria);
        }
      })
      .catch(() => {
        // Sem tema a página continua funcionando — ela existe para receber o
        // contato, não para ser bonita.
      });
  }, []);

  /** (11) 91234-5678 conforme digita. */
  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro('');

    if (nome.trim().length < 2) {
      setErro('Informe seu nome.');
      return;
    }

    const digits = telefone.replace(/\D/g, '');
    if (!digits && !email.trim()) {
      setErro('Deixe um telefone ou um e-mail para a academia entrar em contato.');
      return;
    }

    try {
      setIsSending(true);
      const response = await fetch(`${apiUrl}/public/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caDominio: window.location.hostname,
          nmLead: nome.trim(),
          nrDDD: digits.slice(0, 2),
          nrContato: digits.slice(2),
          anEmail: email.trim(),
          dsMensagem: mensagem.trim(),
        }),
      });

      if (!response.ok) {
        // Mensagem genérica de propósito: detalhar o motivo para quem não está
        // autenticado ajuda mais quem está sondando do que quem quer treinar.
        setErro('Não foi possível enviar agora. Tente novamente em instantes.');
        return;
      }

      setEnviado(true);
    } catch {
      setErro('Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setIsSending(false);
    }
  }

  if (enviado) {
    return (
      <main className="interest-page">
        <section className="interest-card interest-done">
          <CheckCircle2 aria-hidden="true" size={44} />
          <h1>Recebemos seu contato</h1>
          <p>
            A equipe {theme?.dsCliente ? `da ${theme.dsCliente}` : 'da academia'} vai falar com
            você em breve.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="interest-page">
      <section className="interest-card">
        <header className="interest-header">
          {theme?.logoUrl ? (
            <img alt={theme.dsCliente ?? 'Academia'} className="interest-logo" src={theme.logoUrl} />
          ) : null}
          <h1>Quero treinar {theme?.dsCliente ? `na ${theme.dsCliente}` : 'aqui'}</h1>
          <p>Deixe seu contato e a gente retorna com planos e horários.</p>
        </header>

        <form className="interest-form" onSubmit={handleSubmit}>
          <label>
            <span>Seu nome</span>
            <input
              autoComplete="name"
              maxLength={255}
              onChange={(event) => setNome(event.target.value)}
              required
              type="text"
              value={nome}
            />
          </label>

          <label>
            <span>Telefone / WhatsApp</span>
            <input
              autoComplete="tel"
              inputMode="tel"
              onChange={(event) => setTelefone(formatPhone(event.target.value))}
              placeholder="(00) 00000-0000"
              type="tel"
              value={telefone}
            />
          </label>

          <label>
            <span>E-mail</span>
            <input
              autoComplete="email"
              maxLength={100}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="opcional"
              type="email"
              value={email}
            />
          </label>

          <label>
            <span>O que você procura?</span>
            <textarea
              maxLength={500}
              onChange={(event) => setMensagem(event.target.value)}
              placeholder="Musculação, aulas, horário que prefere treinar..."
              rows={3}
              value={mensagem}
            />
          </label>

          {erro ? (
            <p className="interest-error" role="alert">
              {erro}
            </p>
          ) : null}

          <button className="interest-submit" disabled={isSending} type="submit">
            <Send aria-hidden="true" size={16} />
            {isSending ? 'Enviando...' : 'Quero saber mais'}
          </button>

          <p className="interest-note">
            Usamos seus dados apenas para entrar em contato sobre a academia.
          </p>
        </form>
      </section>
    </main>
  );
}
