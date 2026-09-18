import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../../lib/components/Screen';
import { apiGet, apiPost } from '../../lib/api/client';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTokens } from '../../lib/theme/tokens';
import { formatCpf, onlyDigits } from '../../lib/utils/format';

// Venda no balcão.
//
// É o mesmo ProdutoMovimentacao das compras, do outro lado do estoque: compra
// tem fornecedor e SOMA, venda tem aluno e SUBTRAI. Por isso o aluno é
// obrigatório — sem ele o registro vira entrada de estoque, não venda.
//
// A UNIDADE vem da sessão (`user.idEmpresa`), nunca de um seletor. A venda
// debita o estoque de uma filial; deixar a tela escolher faria a recepção de
// uma unidade tirar produto da outra sem perceber.

type Aluno = { id: number; nmAluno: string; caCPF: string | null };
type Produto = { id: number; dsProduto: string; vlVenda: string | number | null; qtEstoque: number };

function paraNumero(valor: string | number | null | undefined): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function VendaScreen() {
  const t = useTokens();
  const { user } = useAuth();
  const idEmpresa = user?.idEmpresa ?? null;

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produto, setProduto] = useState<Produto | null>(null);

  const [busca, setBusca] = useState('');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [aluno, setAluno] = useState<Aluno | null>(null);

  const [quantidade, setQuantidade] = useState('1');
  const [valorUnitario, setValorUnitario] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSalvando, setIsSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregarProdutos = useCallback(async () => {
    try {
      setErro('');
      setProdutos(await apiGet<Produto[]>('/products'));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar os produtos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarProdutos();
  }, [carregarProdutos]);

  async function buscarAlunos() {
    if (!busca.trim()) return;
    setErro('');
    try {
      setAlunos(await apiGet<Aluno[]>(`/students?search=${encodeURIComponent(busca.trim())}`));
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível buscar alunos.');
    }
  }

  function escolherProduto(item: Produto) {
    setProduto(item);
    // Preço sugerido do cadastro, e editável: promoção de balcão e desconto
    // pontual existem, e obrigar a pessoa a alterar o produto para dar um
    // desconto faria a alteração valer para todo mundo.
    setValorUnitario(String(paraNumero(item.vlVenda).toFixed(2)).replace('.', ','));
  }

  async function registrar() {
    if (isSalvando) return;
    setErro('');
    setOk('');

    if (!idEmpresa) {
      setErro('Sua conta não está vinculada a uma unidade. Fale com o gerente.');
      return;
    }
    if (!produto) return setErro('Selecione o produto.');
    if (!aluno) return setErro('Selecione o aluno.');

    const qtd = Number(onlyDigits(quantidade));
    if (!Number.isInteger(qtd) || qtd <= 0) return setErro('Informe uma quantidade válida.');

    const unitario = Number(valorUnitario.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(unitario) || unitario < 0) return setErro('Informe um valor válido.');

    setIsSalvando(true);
    try {
      await apiPost(`/companies/${idEmpresa}/children/sales`, {
        idProduto: produto.id,
        idAluno: aluno.id,
        qtMovimentada: qtd,
        vlUnitario: unitario,
      });
      setOk(`Venda registrada: ${qtd}x ${produto.dsProduto} para ${aluno.nmAluno}.`);
      setProduto(null);
      setAluno(null);
      setQuantidade('1');
      setValorUnitario('');
      setAlunos([]);
      setBusca('');
      // Reflete o estoque que acabou de sair.
      await carregarProdutos();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível registrar a venda.');
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
  const total = paraNumero(valorUnitario.replace(/\./g, '').replace(',', '.')) * Number(onlyDigits(quantidade) || 0);

  return (
    <Screen sectionLabel="Equipe" title="Venda no balcão">
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

      <Text style={[styles.secao, { color: t.textMuted }]}>1. PRODUTO</Text>
      {isLoading ? (
        <ActivityIndicator color={t.brand} style={styles.carregando} />
      ) : produtos.length === 0 ? (
        <Text style={[styles.vazio, { color: t.textSubtle }]}>
          Nenhum produto cadastrado nesta academia.
        </Text>
      ) : (
        produtos.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => escolherProduto(item)}
            style={[
              styles.opcao,
              {
                backgroundColor: produto?.id === item.id ? t.brandTintSoft : t.surface,
                borderColor: produto?.id === item.id ? t.brand : t.border,
                borderRadius: t.radius,
              },
            ]}
          >
            <Text style={[styles.opcaoTitulo, { color: t.text }]}>{item.dsProduto}</Text>
            <Text style={[styles.opcaoDetalhe, { color: t.textMuted }]}>
              {formatMoeda(paraNumero(item.vlVenda))} · {item.qtEstoque} em estoque
            </Text>
          </Pressable>
        ))
      )}

      <Text style={[styles.secao, { color: t.textMuted }]}>2. ALUNO</Text>
      <View style={styles.buscaLinha}>
        <TextInput
          onChangeText={setBusca}
          onSubmitEditing={buscarAlunos}
          placeholder="Nome ou CPF completo"
          placeholderTextColor={t.placeholder}
          returnKeyType="search"
          style={[styles.input, styles.inputFlex, estiloInput]}
          value={busca}
        />
        <Pressable
          accessibilityRole="button"
          onPress={buscarAlunos}
          style={[styles.buscar, { backgroundColor: t.brand, borderRadius: t.radius }]}
        >
          <Text style={styles.buscarTexto}>Buscar</Text>
        </Pressable>
      </View>

      {aluno ? (
        <View style={[styles.opcao, { backgroundColor: t.brandTintSoft, borderColor: t.brand, borderRadius: t.radius }]}>
          <Text style={[styles.opcaoTitulo, { color: t.text }]}>{aluno.nmAluno}</Text>
          <Text style={[styles.opcaoDetalhe, { color: t.textMuted }]}>
            {aluno.caCPF ? formatCpf(aluno.caCPF) : 'sem CPF'}
          </Text>
        </View>
      ) : (
        alunos.map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => setAluno(item)}
            style={[
              styles.opcao,
              { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius },
            ]}
          >
            <Text style={[styles.opcaoTitulo, { color: t.text }]}>{item.nmAluno}</Text>
            <Text style={[styles.opcaoDetalhe, { color: t.textMuted }]}>
              {item.caCPF ? formatCpf(item.caCPF) : 'sem CPF'}
            </Text>
          </Pressable>
        ))
      )}

      <Text style={[styles.secao, { color: t.textMuted }]}>3. VALORES</Text>
      <View style={styles.linhaDupla}>
        <View style={styles.qtd}>
          <Text style={[styles.rotulo, { color: t.textMuted }]}>Quantidade</Text>
          <TextInput
            keyboardType="number-pad"
            maxLength={4}
            onChangeText={(valor) => setQuantidade(onlyDigits(valor))}
            placeholder="1"
            placeholderTextColor={t.placeholder}
            style={[styles.input, estiloInput]}
            value={quantidade}
          />
        </View>
        <View style={styles.valor}>
          <Text style={[styles.rotulo, { color: t.textMuted }]}>Valor unitário</Text>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setValorUnitario}
            placeholder="0,00"
            placeholderTextColor={t.placeholder}
            style={[styles.input, estiloInput]}
            value={valorUnitario}
          />
        </View>
      </View>

      <Text style={[styles.total, { color: t.text }]}>Total: {formatMoeda(total)}</Text>

      <Pressable
        accessibilityRole="button"
        disabled={isSalvando}
        onPress={registrar}
        style={[
          styles.salvar,
          { backgroundColor: t.brand, borderRadius: t.radius, opacity: isSalvando ? 0.6 : 1 },
        ]}
      >
        <Text style={styles.salvarTexto}>{isSalvando ? 'Registrando...' : 'Registrar venda'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  aviso: { padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 14 },
  secao: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  carregando: { marginTop: 16 },
  vazio: { fontSize: 14, lineHeight: 20 },
  opcao: { borderWidth: 1, padding: 12, marginBottom: 8 },
  opcaoTitulo: { fontSize: 15, fontWeight: '600' },
  opcaoDetalhe: { fontSize: 13, marginTop: 2 },
  buscaLinha: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  inputFlex: { flex: 1 },
  buscar: { paddingHorizontal: 16, justifyContent: 'center' },
  buscarTexto: { color: '#fff', fontWeight: '600' },
  rotulo: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  linhaDupla: { flexDirection: 'row', gap: 8 },
  qtd: { width: 110 },
  valor: { flex: 1 },
  total: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  salvar: { paddingVertical: 16, alignItems: 'center', marginTop: 16, marginBottom: 32 },
  salvarTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
