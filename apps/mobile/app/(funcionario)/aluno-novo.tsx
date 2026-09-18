import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiPost } from '../../lib/api/client';
import { useTokens } from '../../lib/theme/tokens';
import {
  LIMITES,
  formatCpf,
  formatPhone,
  getStudentNameError,
  isValidCpf,
  isValidEmail,
  onlyDigits,
} from '../../lib/utils/format';

// Cadastro de aluno pelo celular.
//
// As validações aqui são as MESMAS do servidor, importadas de @solsfit/shared —
// não uma segunda implementação. Isso não é zelo: a mensagem duplicada é
// exatamente como duas regras saem de sincronia, e este app já teve o caso
// (format.ts guarda a história). O servidor continua validando tudo de novo;
// o que se ganha aqui é o erro aparecer antes de gastar uma requisição.
//
// O CPF é obrigatório porque é a CREDENCIAL DE LOGIN do aluno (caCPFHash), e
// não um campo de ficha: sem ele a pessoa fica cadastrada e sem conseguir
// entrar no app.

type Campos = {
  nmAluno: string;
  caCPF: string;
  anEmail: string;
  nrDDD: string;
  nrContato: string;
  dtNascimento: string;
};

const VAZIO: Campos = {
  nmAluno: '',
  caCPF: '',
  anEmail: '',
  nrDDD: '',
  nrContato: '',
  dtNascimento: '',
};

/** dd/mm/aaaa digitado -> aaaa-mm-dd, que é o que a API espera. */
function paraDataIso(valor: string): string | null {
  const digitos = onlyDigits(valor);
  if (digitos.length !== 8) return null;
  const dia = digitos.slice(0, 2);
  const mes = digitos.slice(2, 4);
  const ano = digitos.slice(4, 8);
  return `${ano}-${mes}-${dia}`;
}

function formatDataDigitada(valor: string) {
  const d = onlyDigits(valor).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export default function AlunoNovoScreen() {
  const t = useTokens();

  const [campos, setCampos] = useState<Campos>(VAZIO);
  const [isSalvando, setIsSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  function set<K extends keyof Campos>(chave: K, valor: string) {
    setCampos((atual) => ({ ...atual, [chave]: valor }));
  }

  function validar(): string | null {
    const erroNome = getStudentNameError(campos.nmAluno);
    if (erroNome) return erroNome;

    const cpf = onlyDigits(campos.caCPF);
    if (!cpf) return 'Informe o CPF do aluno.';
    if (!isValidCpf(cpf)) return 'Informe um CPF válido.';

    if (campos.anEmail.trim() && !isValidEmail(campos.anEmail.trim())) {
      return 'Informe um e-mail válido.';
    }

    const ddd = onlyDigits(campos.nrDDD);
    if (ddd && (ddd.length > 2 || Number(ddd) > 99)) return 'Informe um DDD válido.';

    if (campos.dtNascimento && !paraDataIso(campos.dtNascimento)) {
      return 'Informe a data de nascimento como dd/mm/aaaa.';
    }
    return null;
  }

  async function salvar() {
    if (isSalvando) return;
    setErro('');
    setOk('');

    const problema = validar();
    if (problema) {
      setErro(problema);
      return;
    }

    setIsSalvando(true);
    try {
      // `idCliente` NÃO vai no corpo: a rota o tira do token e ignora o que
      // vier daqui. Mandar seria sugerir que a tela escolhe o tenant.
      const aluno = await apiPost<{ id: number; nmAluno: string }>('/students', {
        nmAluno: campos.nmAluno.trim(),
        caCPF: onlyDigits(campos.caCPF),
        anEmail: campos.anEmail.trim() || null,
        nrDDD: onlyDigits(campos.nrDDD) || 0,
        nrContato: onlyDigits(campos.nrContato) || null,
        dtNascimento: paraDataIso(campos.dtNascimento),
      });
      setOk(`${aluno.nmAluno} cadastrado.`);
      setCampos(VAZIO);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível cadastrar o aluno.');
    } finally {
      setIsSalvando(false);
    }
  }

  const estiloInput = {
    backgroundColor: t.inputBg,
    borderColor: t.border,
    borderRadius: t.radius,
    color: t.text,
  };

  return (
    <Screen onBack={() => router.back()} sectionLabel="Equipe" title="Cadastrar aluno">
      {erro ? (
        <View style={[styles.aviso, { backgroundColor: '#fdeceb', borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.danger }]}>{erro}</Text>
        </View>
      ) : null}

      {ok ? (
        <View style={[styles.aviso, { backgroundColor: t.brandTintSoft, borderRadius: t.radius }]}>
          <Text style={[styles.avisoTexto, { color: t.text }]}>{ok}</Text>
        </View>
      ) : null}

      <Text style={[styles.rotulo, { color: t.textMuted }]}>Nome completo *</Text>
      <TextInput
        autoCapitalize="words"
        maxLength={LIMITES.aluno.nmAluno}
        onChangeText={(valor) => set('nmAluno', valor)}
        placeholder="Nome do aluno"
        placeholderTextColor={t.placeholder}
        style={[styles.input, estiloInput]}
        value={campos.nmAluno}
      />

      <Text style={[styles.rotulo, { color: t.textMuted }]}>CPF *</Text>
      <TextInput
        keyboardType="number-pad"
        maxLength={14}
        onChangeText={(valor) => set('caCPF', formatCpf(onlyDigits(valor)))}
        placeholder="000.000.000-00"
        placeholderTextColor={t.placeholder}
        style={[styles.input, estiloInput]}
        value={campos.caCPF}
      />
      <Text style={[styles.dica, { color: t.textSubtle }]}>
        É com o CPF que o aluno entra no aplicativo.
      </Text>

      <Text style={[styles.rotulo, { color: t.textMuted }]}>E-mail</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        maxLength={LIMITES.aluno.anEmail}
        onChangeText={(valor) => set('anEmail', valor)}
        placeholder="aluno@email.com"
        placeholderTextColor={t.placeholder}
        style={[styles.input, estiloInput]}
        value={campos.anEmail}
      />

      <View style={styles.linhaDupla}>
        <View style={styles.ddd}>
          <Text style={[styles.rotulo, { color: t.textMuted }]}>DDD</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(valor) => set('nrDDD', onlyDigits(valor))}
            placeholder="11"
            placeholderTextColor={t.placeholder}
            style={[styles.input, estiloInput]}
            value={campos.nrDDD}
          />
        </View>
        <View style={styles.telefone}>
          <Text style={[styles.rotulo, { color: t.textMuted }]}>Telefone</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={15}
            onChangeText={(valor) => set('nrContato', formatPhone(onlyDigits(valor)))}
            placeholder="90000-0000"
            placeholderTextColor={t.placeholder}
            style={[styles.input, estiloInput]}
            value={campos.nrContato}
          />
        </View>
      </View>

      <Text style={[styles.rotulo, { color: t.textMuted }]}>Data de nascimento</Text>
      <TextInput
        keyboardType="number-pad"
        maxLength={10}
        onChangeText={(valor) => set('dtNascimento', formatDataDigitada(valor))}
        placeholder="dd/mm/aaaa"
        placeholderTextColor={t.placeholder}
        style={[styles.input, estiloInput]}
        value={campos.dtNascimento}
      />

      <Pressable
        accessibilityRole="button"
        disabled={isSalvando}
        onPress={salvar}
        style={[
          styles.salvar,
          { backgroundColor: t.brand, borderRadius: t.radius, opacity: isSalvando ? 0.6 : 1 },
        ]}
      >
        <Text style={styles.salvarTexto}>{isSalvando ? 'Salvando...' : 'Cadastrar aluno'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14 },
  rotulo: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dica: { fontSize: 12, marginTop: 6 },
  linhaDupla: { flexDirection: 'row', gap: 8 },
  ddd: { width: 80 },
  telefone: { flex: 1 },
  salvar: { paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 32 },
  salvarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
