export interface Client {
  id: number;
  dsCliente: string;
  caCNPJ: string | null;
  boInativo: boolean | number;
}

export interface ClientTheme {
  idCliente: number;
  corPrimaria: string;
  corSecundaria: string;
  corAcentuacao: string;
  corTexto: string;
  corFundo: string;
  fontePrincipal: string;
  fonteSecundaria: string;
  tamanhoBase: number;
  espacamentoPadrao: number;
  raioCardBorder: number;
  // O banco guarda booleano; a rota antiga devolvia numero em alguns caminhos.
  // Nenhum consumidor compara com `1`, entao aceitar os dois evita um cast que
  // so existiria para agradar o compilador.
  boModoEscuro: boolean | number;

  /**
   * Nome da academia, para o app dizer em qual sistema a pessoa está.
   *
   * O rótulo embaixo do ícone continua sendo "SOLSFIT" para todo mundo — o
   * Android assa isso no APK e o mesmo binário atende todas as academias. A
   * identidade do cliente vive DENTRO do app, que é onde ela pode mudar por
   * sessão.
   */
  dsCliente?: string | null;

  /**
   * Logo da academia, como URL assinada com validade de uma hora.
   *
   * Vence de propósito: o arquivo mora em bucket privado do provedor, e o
   * /auth/verify do boot renova. Se vencer com o app aberto, a tela fica sem o
   * logo e com o nome — nunca com erro.
   */
  logoUrl?: string | null;

}

export interface ClientLoaderState {
  data: Client | null;
  theme: ClientTheme | null;
  loading: boolean;
  error: string | null;
}
