export interface Client {
  id: number;
  dsCliente: string;
  caCNPJ: string | null;
  boInativo: number;
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
  boModoEscuro: number;
}

export interface ClientLoaderState {
  data: Client | null;
  theme: ClientTheme | null;
  loading: boolean;
  error: string | null;
}
