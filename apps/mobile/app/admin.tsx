import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from 'expo-camera';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCurrentClient } from '../lib/hooks/useCurrentClient';
import { useTheme } from '../lib/contexts/ThemeContext';
// Alias: todas as chamadas fetch deste módulo passam a enviar o JWT da sessão.
import { authFetch as fetch, setAuthToken } from '../lib/api/client';
// Helpers de formatacao/validacao: vinham reimplementados neste arquivo,
// identicos aos de lib/utils/format.ts que todas as outras telas ja usam.
import {
  LIMITES,
  formatCnpj,
  formatCpf,
  formatPhone,
  getPasswordValidationMessage,
  isImageFile,
  isValidCnpj,
  isValidCpf,
  isValidEmail,
  onlyDigits,
} from '../lib/utils/format';

function getApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

  if (configuredUrl) {
    return configuredUrl;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];

  if (host) {
    return `http://${host}:3333`;
  }

  return 'http://10.0.2.2:3333';
}

const apiUrl = getApiUrl();

type AppTab = 'EMPRESA' | 'HOME' | 'CADASTROS' | 'PROFILE';
type RegistrationScreen =
  | 'Empresas Cadastro'
  | 'Exercicios Cadastro'
  | 'Treino Cadastro'
  | 'Meu Treino'
  | 'Produtos Cadastro'
  | 'Compras Movimentacao'
  | 'Matriculas'
  | 'Profissionais'
  | 'Dominios';

const appTabs: AppTab[] = ['EMPRESA', 'HOME', 'CADASTROS', 'PROFILE'];
const registrationScreens: RegistrationScreen[] = [
  'Empresas Cadastro',
  'Exercicios Cadastro',
  'Treino Cadastro',
  'Meu Treino',
  'Produtos Cadastro',
  'Compras Movimentacao',
  'Matriculas',
  'Profissionais',
  'Dominios',
];
const registrationInfo: Record<
  RegistrationScreen,
  { accent: string; group: string; shortLabel: string; title: string }
> = {
  'Empresas Cadastro': {
    accent: '#1f7a53',
    group: 'Empresa',
    shortLabel: 'EM',
    title: 'Empresas',
  },
  'Exercicios Cadastro': {
    accent: '#2563eb',
    group: 'Treino',
    shortLabel: 'EX',
    title: 'Exercícios',
  },
  'Treino Cadastro': {
    accent: '#7c3aed',
    group: 'Treino',
    shortLabel: 'TR',
    title: 'Treinos',
  },
  'Meu Treino': {
    accent: '#0f766e',
    group: 'Treino',
    shortLabel: 'MT',
    title: 'Meu Treino',
  },
  'Produtos Cadastro': {
    accent: '#b45309',
    group: 'Estoque',
    shortLabel: 'PR',
    title: 'Produtos',
  },
  'Compras Movimentacao': {
    accent: '#be123c',
    group: 'Estoque',
    shortLabel: 'CM',
    title: 'Compras',
  },
  Matriculas: {
    accent: '#0369a1',
    group: 'Alunos',
    shortLabel: 'AL',
    title: 'Matrículas',
  },
  Profissionais: {
    accent: '#4d7c0f',
    group: 'RH',
    shortLabel: 'RH',
    title: 'Profissionais',
  },
  Dominios: {
    accent: '#475569',
    group: 'Config',
    shortLabel: 'DM',
    title: 'Domínios',
  },
};

const domainItems = [
  'Cargo',
  'Tema',
  'Frequencia',
  'Nivel',
  'UnidadeTempo',
  'StatusPagamento',
  'FormaPagamento',
  'MetodoTreino',
  'TipoArquivo',
] as const;
type DomainItem = (typeof domainItems)[number];

type Product = {
  id: number;
  idEmpresa: number | null;
  dsProduto: string;
  qtEstoque: number;
  // Nao editaveis no app; ver CompanyPreservados para o porque de existirem aqui.
  vlVenda: string | number | null;
  qtPontosResgate: number | null;
  boInativo: number;
};

type ProductPreservados = Pick<Product, 'vlVenda' | 'qtPontosResgate'>;

const PRODUCT_PRESERVADOS_VAZIO: ProductPreservados = {
  vlVenda: null,
  qtPontosResgate: null,
};

// Os campos que o formulario do app NAO edita continuam no tipo de proposito:
// a listagem ja os devolve, e sao eles que o PUT precisa reenviar. Ver
// `preservados` em cada tela.
type Company = {
  id: number;
  dsEmpresa: string;
  caCNPJ: string;
  anCEP: string | null;
  anLogradouro: string | null;
  nrEndereco: string | null;
  anBairro: string | null;
  anCidade: string | null;
  anUF: string | null;
  nrDDD: number | null;
  nrContato: string | null;
  boInativo: number;
};

/**
 * Campos que a tela do app nao mostra e que o PUT tem de devolver intactos.
 *
 * As rotas PUT gravam o objeto normalizado INTEIRO: campo ausente no corpo vira
 * null/'' e sobrescreve o que estava la. Como o app tem um formulario menor que
 * o do web, salvar uma empresa pelo celular apagava o endereco inteiro que a
 * recepcao tinha preenchido no navegador — sem erro e sem aviso.
 *
 * A listagem ja devolve essas colunas, entao o conserto e so nao perde-las no
 * caminho: guarda no `handleSelect` e reenvia no `handleSave`.
 */
type CompanyPreservados = Pick<
  Company,
  'anCEP' | 'anLogradouro' | 'nrEndereco' | 'anBairro' | 'anCidade' | 'anUF' | 'nrDDD' | 'nrContato'
>;

const COMPANY_PRESERVADOS_VAZIO: CompanyPreservados = {
  anCEP: null,
  anLogradouro: null,
  nrEndereco: null,
  anBairro: null,
  anCidade: null,
  anUF: null,
  nrDDD: null,
  nrContato: null,
};

type Student = {
  id: number;
  nmAluno: string;
  caCPF: string;
  dtNascimento: string | null;
  nrDDD: number;
  nrContato: string | null;
  anEmail: string;
  anCEP: string;
  anLogradouro: string;
  // Coluna VarChar(10): cabe "123A" e "s/n", nao so digito.
  nrEndereco: string | null;
  // Nao editaveis no app; ver CompanyPreservados para o porque de existirem aqui.
  anBairro: string;
  anComplemento: string;
  boInativo: number;
};

type StudentPreservados = Pick<Student, 'anBairro' | 'anComplemento'>;

const STUDENT_PRESERVADOS_VAZIO: StudentPreservados = {
  anBairro: '',
  anComplemento: '',
};

type StudentFile = {
  id: number;
  idAluno: number | null;
  anCaminho: string;
  dtCadastro: string;
  boInativo: number;
};

type DomainRecord = {
  id: number;
  name: string;
  boInativo: number;
  description?: string;
};

const domainConfig: Record<
  string,
  {
    endpoint: string;
    field: string;
    label: string;
    saveLabel: string;
    secondField?: string;
    secondFieldLabel?: string;
  }
> = {
  Cargo: { endpoint: 'roles', field: 'dsCargo', label: 'Cargo', saveLabel: 'Salvar cargo' },
  Frequencia: { endpoint: 'frequencies', field: 'dsFrequencia', label: 'Frequência', saveLabel: 'Salvar frequência' },
  Nivel: { endpoint: 'levels', field: 'dsNivel', label: 'Nível', saveLabel: 'Salvar nível' },
  UnidadeTempo: { endpoint: 'time-units', field: 'dsUnidadeTempo', label: 'Unidade de tempo', saveLabel: 'Salvar unidade' },
  StatusPagamento: { endpoint: 'payment-statuses', field: 'dsStatusPagamento', label: 'Status de pagamento', saveLabel: 'Salvar status' },
  FormaPagamento: { endpoint: 'payment-methods', field: 'dsFormaPagamento', label: 'Forma de pagamento', saveLabel: 'Salvar forma' },
  MetodoTreino: {
    endpoint: 'training-methods',
    field: 'nmMetodoTreino',
    label: 'Método de treino',
    saveLabel: 'Salvar método',
    secondField: 'dsMetodoTreino',
    secondFieldLabel: 'Descrição',
  },
  TipoArquivo: { endpoint: 'file-types', field: 'dsTipo', label: 'Tipo de arquivo', saveLabel: 'Salvar tipo' },
};

type StudentValidationField = 'name' | 'cpf' | 'birthDate' | 'email';
type StudentValidationErrors = Partial<Record<StudentValidationField, string>>;

function CompanyRegistration() {
  const theme = useTheme();
  const primary = theme?.corPrimaria ?? '#1f7a53';
  const dark = theme?.corTexto ?? '#17211c';
  const r = theme?.raioCardBorder ?? 8;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  // Endereco e contato da empresa: o app nao os edita, mas o PUT precisa
  // reenvia-los ou eles somem do banco.
  const [companyPreservados, setCompanyPreservados] = useState<CompanyPreservados>(
    COMPANY_PRESERVADOS_VAZIO,
  );
  const [isCompanyActive, setIsCompanyActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isFormEnabled = selectedCompanyId !== null || isCreating;
  const filteredCompanies = companies.filter((company) => {
    const search = searchTerm.toLowerCase();

    return (
      company.dsEmpresa.toLowerCase().includes(search) ||
      company.caCNPJ.includes(searchTerm.replace(/\D/g, ''))
    );
  });

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar as empresas.');
      }

      const data = (await response.json()) as Company[];
      setCompanies(data);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar empresas.',
      );
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, []);

  function clearForm() {
    setSelectedCompanyId(null);
    setIsCreating(false);
    setCompanyName('');
    setCompanyCnpj('');
    setCompanyPreservados(COMPANY_PRESERVADOS_VAZIO);
    setIsCompanyActive(false);
  }

  function handleNewCompany() {
    setSelectedCompanyId(null);
    setIsCreating(true);
    setCompanyName('');
    setCompanyCnpj('');
    setCompanyPreservados(COMPANY_PRESERVADOS_VAZIO);
    setIsCompanyActive(true);
    setFeedback('');
  }

  function handleSelectCompany(company: Company) {
    setSelectedCompanyId(company.id);
    setIsCreating(false);
    setCompanyName(company.dsEmpresa);
    // Vem cru do banco (so digitos); a tela mostra mascarado.
    setCompanyCnpj(formatCnpj(company.caCNPJ));
    setCompanyPreservados({
      anCEP: company.anCEP,
      anLogradouro: company.anLogradouro,
      nrEndereco: company.nrEndereco,
      anBairro: company.anBairro,
      anCidade: company.anCidade,
      anUF: company.anUF,
      nrDDD: company.nrDDD,
      nrContato: company.nrContato,
    });
    setIsCompanyActive(company.boInativo === 0);
    setFeedback('');
  }

  async function handleToggleStatus() {
    const nextActive = !isCompanyActive;
    setIsCompanyActive(nextActive);

    if (!selectedCompanyId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/companies/${selectedCompanyId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        throw new Error('Não foi possível alterar o status.');
      }

      const updatedCompany = (await response.json()) as Company;
      setCompanies((current) =>
        current.map((company) =>
          company.id === updatedCompany.id ? updatedCompany : company,
        ),
      );
    } catch (error) {
      setIsCompanyActive(!nextActive);
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  async function handleSaveCompany() {
    if (!companyName.trim()) {
      setFeedback('Informe o nome da empresa.');
      return;
    }
    if (!isValidCnpj(companyCnpj)) {
      setFeedback('Informe um CNPJ válido.');
      return;
    }

    try {
      const payload = {
        // Devolve intacto o que a tela nao mostra.
        ...companyPreservados,
        dsEmpresa: companyName.trim(),
        // A API so aceita digitos; a mascara e da tela.
        caCNPJ: onlyDigits(companyCnpj),
        boInativo: isCompanyActive ? 0 : 1,
      };
      const response = await fetch(
        selectedCompanyId
          ? `${apiUrl}/companies/${selectedCompanyId}`
          : `${apiUrl}/companies`,
        {
          method: selectedCompanyId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const savedCompany = (await response.json()) as Company;
      setCompanies((current) => {
        if (selectedCompanyId) {
          return current.map((company) =>
            company.id === savedCompany.id ? savedCompany : company,
          );
        }

        return [...current, savedCompany].sort((a, b) =>
          a.dsEmpresa.localeCompare(b.dsEmpresa),
        );
      });
      setSelectedCompanyId(savedCompany.id);
      setIsCreating(false);
      setFeedback('Empresa salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <ScrollView
      style={styles.productScroller}
      contentContainerStyle={styles.productView}
    >
      <Text style={styles.sectionLabel}>Empresa</Text>
      <Text style={styles.formTitle}>Cadastro de Empresa</Text>
      <Text style={styles.formDescription}>
        Cadastre e gerencie as empresas que usam a plataforma SmartGym.
      </Text>

      <View style={styles.productGridSection}>
        <Text style={styles.sectionLabel}>Empresas</Text>
        <Text style={styles.gridTitle}>Empresas cadastradas</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Buscar empresa"
          placeholderTextColor="#82918a"
          style={styles.searchInput}
          value={searchTerm}
        />
        <Pressable accessibilityRole="button" onPress={handleNewCompany} style={[styles.newButton, { backgroundColor: dark, borderRadius: r }]}>
          <Text style={styles.newButtonText}>Nova empresa</Text>
        </Pressable>

        <View style={styles.productList}>
          {filteredCompanies.map((company) => (
            <Pressable accessibilityRole="button"
              key={company.id}
              onPress={() => handleSelectCompany(company)}
              style={[
                styles.productCard,
                { borderRadius: r },
                company.id === selectedCompanyId && [styles.productCardSelected, { borderColor: primary }],
              ]}
            >
              <View style={styles.productCardHeader}>
                <Text style={styles.productName}>{company.dsEmpresa}</Text>
                <Text
                  style={[
                    styles.productStatus,
                    company.boInativo === 0
                      ? styles.productStatusActive
                      : styles.productStatusInactive,
                  ]}
                >
                  {company.boInativo === 0 ? 'Ativo' : 'Inativo'}
                </Text>
              </View>
              <Text style={styles.productStock}>CNPJ: {company.caCNPJ}</Text>
            </Pressable>
          ))}

          {filteredCompanies.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma empresa encontrada.</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.productForm}>
        {!isFormEnabled ? (
          <Text style={styles.formHint}>
            Selecione uma empresa acima para editar ou toque em Nova empresa.
          </Text>
        ) : null}

        {feedback ? <Text style={styles.formFeedback}>{feedback}</Text> : null}

        <Text style={styles.label}>Empresa</Text>
        <TextInput
          editable={isFormEnabled}
          maxLength={LIMITES.empresa.dsEmpresa}
          onChangeText={setCompanyName}
          placeholder="Ex.: Academia Cliente"
          placeholderTextColor="#82918a"
          style={styles.input}
          value={companyName}
        />

        {/* Sem mascara e sem conferencia do digito verificador, o CNPJ so era
            recusado pela API depois do envio — enquanto o web ja validava na
            digitacao. Mesma funcao dos dois lados (@smartgym/shared). */}
        <Text style={styles.label}>CNPJ</Text>
        <TextInput
          editable={isFormEnabled}
          keyboardType="number-pad"
          maxLength={18}
          onChangeText={(value) => setCompanyCnpj(formatCnpj(value))}
          placeholder="00.000.000/0000-00"
          placeholderTextColor="#82918a"
          style={[styles.input, companyCnpj.trim() && !isValidCnpj(companyCnpj) && styles.inputError]}
          value={companyCnpj}
        />
        {companyCnpj.trim() && !isValidCnpj(companyCnpj) ? (
          <Text style={styles.fieldErrorText}>Informe um CNPJ válido.</Text>
        ) : null}

        {/* O campo "Tema" gravava `cnTemaTP`, coluna REMOVIDA de tb_Empresas
            pela migration 20260430174000_sync_new_academia_diagram. O
            normalizador da API nem conhece o nome, entao o valor era descartado
            em silencio e a lista mostrava "Tema: undefined". Tema de empresa
            hoje e o TemaCustomizado, editado em outra tela. */}

        <Text style={styles.label}>Status</Text>
        <Pressable accessibilityRole="button"
          disabled={!isFormEnabled}
          onPress={handleToggleStatus}
          style={[
            styles.statusToggle,
            !isFormEnabled && styles.disabledControl,
          ]}
        >
          <View
            style={[
              styles.statusToggleThumb,
              isCompanyActive && [styles.statusToggleThumbActive, { backgroundColor: primary }],
            ]}
          >
            <Text style={styles.statusToggleText}>
              {isCompanyActive ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.formActions}>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={clearForm}
            style={[styles.clearButton, !isFormEnabled && styles.disabledControl]}
          >
            <Text style={styles.clearButtonText}>Limpar</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={handleSaveCompany}
            style={[styles.saveButton, { backgroundColor: primary, borderRadius: r }, !isFormEnabled && styles.disabledControl]}
          >
            <Text style={styles.saveButtonText}>Salvar empresa</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function ProductRegistration() {
  const theme = useTheme();
  const primary = theme?.corPrimaria ?? '#1f7a53';
  const dark = theme?.corTexto ?? '#17211c';
  const r = theme?.raioCardBorder ?? 8;
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [productName, setProductName] = useState('');
  const [productStock, setProductStock] = useState('');
  // Preco e preco em pontos nao sao editaveis aqui; sem reenvia-los, salvar um
  // produto pelo app zerava os dois.
  const [productPreservados, setProductPreservados] = useState<ProductPreservados>(
    PRODUCT_PRESERVADOS_VAZIO,
  );
  const [isProductActive, setIsProductActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isFormEnabled = selectedProductId !== null || isCreating;
  const filteredProducts = products.filter((product) =>
    product.dsProduto.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  async function loadProducts() {
    try {
      const response = await fetch(`${apiUrl}/products`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os produtos.');
      }

      const data = (await response.json()) as Product[];
      setProducts(data);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar produtos.',
      );
    }
  }

  async function loadCompanies() {
    try {
      const response = await fetch(`${apiUrl}/companies`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar as empresas.');
      }

      const data = (await response.json()) as Company[];
      setCompanies(data.filter((company) => company.boInativo === 0));
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar empresas.',
      );
    }
  }

  useEffect(() => {
    void loadProducts();
    void loadCompanies();
  }, []);

  function clearForm() {
    setSelectedProductId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setProductName('');
    setProductStock('');
    setProductPreservados(PRODUCT_PRESERVADOS_VAZIO);
    setIsProductActive(false);
  }

  function handleNewProduct() {
    setSelectedProductId(null);
    setIsCreating(true);
    setSelectedCompanyId('');
    setProductName('');
    setProductStock('0');
    setProductPreservados(PRODUCT_PRESERVADOS_VAZIO);
    setIsProductActive(true);
    setFeedback('');
  }

  function handleSelectProduct(product: Product) {
    setSelectedProductId(product.id);
    setIsCreating(false);
    setSelectedCompanyId(product.idEmpresa ? String(product.idEmpresa) : '');
    setProductName(product.dsProduto);
    setProductStock(String(product.qtEstoque));
    setProductPreservados({
      vlVenda: product.vlVenda,
      qtPontosResgate: product.qtPontosResgate,
    });
    setIsProductActive(product.boInativo === 0);
    setFeedback('');
  }

  async function handleToggleStatus() {
    const nextActive = !isProductActive;
    setIsProductActive(nextActive);

    if (!selectedProductId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/products/${selectedProductId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        throw new Error('Não foi possível alterar o status.');
      }

      const updatedProduct = (await response.json()) as Product;
      setProducts((current) =>
        current.map((product) =>
          product.id === updatedProduct.id ? updatedProduct : product,
        ),
      );
    } catch (error) {
      setIsProductActive(!nextActive);
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  async function handleSaveProduct() {
    try {
      const payload = {
        // Devolve intacto o que a tela nao mostra.
        ...productPreservados,
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        dsProduto: productName,
        qtEstoque: Number(productStock || 0),
        boInativo: isProductActive ? 0 : 1,
      };
      const response = await fetch(
        selectedProductId
          ? `${apiUrl}/products/${selectedProductId}`
          : `${apiUrl}/products`,
        {
          method: selectedProductId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const savedProduct = (await response.json()) as Product;
      setProducts((current) => {
        if (selectedProductId) {
          return current.map((product) =>
            product.id === savedProduct.id ? savedProduct : product,
          );
        }

        return [...current, savedProduct].sort((a, b) =>
          a.dsProduto.localeCompare(b.dsProduto),
        );
      });
      setSelectedProductId(savedProduct.id);
      setIsCreating(false);
      setFeedback('Produto salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  return (
    <ScrollView
      style={styles.productScroller}
      contentContainerStyle={styles.productView}
    >
      <Text style={styles.sectionLabel}>Estoque</Text>
      <Text style={styles.formTitle}>Cadastro de Produto</Text>
      <Text style={styles.formDescription}>
        Informe os dados basicos do produto para controlar estoque e
        movimentações.
      </Text>

      <View style={styles.productGridSection}>
        <Text style={styles.sectionLabel}>Produtos</Text>
        <Text style={styles.gridTitle}>Produtos cadastrados</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Buscar produto"
          placeholderTextColor="#82918a"
          style={styles.searchInput}
          value={searchTerm}
        />
        <Pressable accessibilityRole="button" onPress={handleNewProduct} style={[styles.newButton, { backgroundColor: dark, borderRadius: r }]}>
          <Text style={styles.newButtonText}>Novo produto</Text>
        </Pressable>

        <View style={styles.productList}>
          {filteredProducts.map((product) => (
            <Pressable accessibilityRole="button"
              key={product.id}
              onPress={() => handleSelectProduct(product)}
              style={[
                styles.productCard,
                { borderRadius: r },
                product.id === selectedProductId && [styles.productCardSelected, { borderColor: primary }],
              ]}
            >
              <View style={styles.productCardHeader}>
                <Text style={styles.productName}>{product.dsProduto}</Text>
                <Text
                  style={[
                    styles.productStatus,
                    product.boInativo === 0
                      ? styles.productStatusActive
                      : styles.productStatusInactive,
                  ]}
                >
                  {product.boInativo === 0 ? 'Ativo' : 'Inativo'}
                </Text>
              </View>
              <Text style={styles.productStock}>
                Estoque: {product.qtEstoque}
              </Text>
            </Pressable>
          ))}

          {filteredProducts.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.productForm}>
        {!isFormEnabled ? (
          <Text style={styles.formHint}>
            Selecione um produto acima para editar ou toque em Novo produto.
          </Text>
        ) : null}

        {feedback ? <Text style={styles.formFeedback}>{feedback}</Text> : null}

        <Text style={styles.label}>Empresa</Text>
        <View style={styles.optionList}>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={() => setSelectedCompanyId('')}
            style={[
              styles.optionButton,
              selectedCompanyId === '' && styles.optionButtonActive,
              !isFormEnabled && styles.disabledControl,
            ]}
          >
            <Text
              style={[
                styles.optionButtonText,
                selectedCompanyId === '' && styles.optionButtonTextActive,
              ]}
            >
              Sem empresa
            </Text>
          </Pressable>

          {companies.map((company) => (
            <Pressable accessibilityRole="button"
              disabled={!isFormEnabled}
              key={company.id}
              onPress={() => setSelectedCompanyId(String(company.id))}
              style={[
                styles.optionButton,
                selectedCompanyId === String(company.id) &&
                styles.optionButtonActive,
                !isFormEnabled && styles.disabledControl,
              ]}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  selectedCompanyId === String(company.id) &&
                  styles.optionButtonTextActive,
                ]}
              >
                {company.dsEmpresa}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Produto</Text>
        <TextInput
          editable={isFormEnabled}
          maxLength={LIMITES.produto.dsProduto}
          onChangeText={setProductName}
          placeholder="Ex.: Whey Protein 900g"
          placeholderTextColor="#82918a"
          style={styles.input}
          value={productName}
        />

        <Text style={styles.label}>Quantidade em estoque</Text>
        <TextInput
          editable={isFormEnabled}
          keyboardType="number-pad"
          onChangeText={setProductStock}
          placeholder="0"
          placeholderTextColor="#82918a"
          style={styles.input}
          value={productStock}
        />

        <Text style={styles.label}>Status</Text>
        <Pressable accessibilityRole="button"
          disabled={!isFormEnabled}
          onPress={handleToggleStatus}
          style={[
            styles.statusToggle,
            !isFormEnabled && styles.disabledControl,
          ]}
        >
          <View
            style={[
              styles.statusToggleThumb,
              isProductActive && [styles.statusToggleThumbActive, { backgroundColor: primary }],
            ]}
          >
            <Text style={styles.statusToggleText}>
              {isProductActive ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.formActions}>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={clearForm}
            style={[styles.clearButton, !isFormEnabled && styles.disabledControl]}
          >
            <Text style={styles.clearButtonText}>Limpar</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={handleSaveProduct}
            style={[styles.saveButton, { backgroundColor: primary, borderRadius: r }, !isFormEnabled && styles.disabledControl]}
          >
            <Text style={styles.saveButtonText}>Salvar produto</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function formatDateInput(value: string | null) {
  if (!value) {
    return '';
  }

  const [year, month, day] = value.slice(0, 10).split('-');

  return year && month && day ? `${day}/${month}/${year}` : '';
}

function formatBirthDate(value: string) {
  const digits = onlyDigits(value).slice(0, 8);

  return digits
    .replace(/^(\d{2})(\d)/, '$1/$2')
    .replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
}

function toApiDate(value: string) {
  const digits = onlyDigits(value);

  if (digits.length !== 8) {
    return null;
  }

  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

function displayDateToDate(value: string) {
  const digits = onlyDigits(value);

  if (digits.length !== 8) {
    return null;
  }

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function dateToDisplayDate(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

function isValidBirthDate(value: string) {
  const date = displayDateToDate(value);

  if (!date) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date <= today;
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return date;
  });
}

function StudentRegistration() {
  const theme = useTheme();
  const primary = theme?.corPrimaria ?? '#1f7a53';
  const dark = theme?.corTexto ?? '#17211c';
  const r = theme?.raioCardBorder ?? 8;
  const cameraRef = useRef<CameraView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const cpfInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [students, setStudents] = useState<Student[]>([]);
  const [studentFiles, setStudentFiles] = useState<StudentFile[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentCpf, setStudentCpf] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentDdd, setStudentDdd] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentCep, setStudentCep] = useState('');
  const [studentAddress, setStudentAddress] = useState('');
  const [studentAddressNumber, setStudentAddressNumber] = useState('');
  // Bairro e complemento nao existem neste formulario; sem reenvia-los,
  // salvar um aluno pelo app apagava os dois.
  const [studentPreservados, setStudentPreservados] = useState<StudentPreservados>(
    STUDENT_PRESERVADOS_VAZIO,
  );
  const [isBirthCalendarOpen, setIsBirthCalendarOpen] = useState(false);
  const [birthCalendarMonth, setBirthCalendarMonth] = useState(new Date());
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [isStudentActive, setIsStudentActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [studentErrors, setStudentErrors] = useState<StudentValidationErrors>({});
  const [touchedStudentFields, setTouchedStudentFields] = useState<
    Partial<Record<StudentValidationField, boolean>>
  >({});
  const isFormEnabled = selectedStudentId !== null || isCreating;
  const filteredStudents = students.filter((student) => {
    const search = searchTerm.toLowerCase();

    return (
      student.nmAluno.toLowerCase().includes(search) ||
      student.caCPF.includes(searchTerm.replace(/\D/g, '')) ||
      student.anEmail.toLowerCase().includes(search)
    );
  });

  async function loadStudents() {
    try {
      const response = await fetch(`${apiUrl}/students`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os alunos.');
      }

      const data = (await response.json()) as Student[];
      setStudents(data);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar alunos.',
      );
    }
  }

  useEffect(() => {
    void loadStudents();
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      return;
    }

    void loadStudentFiles(selectedStudentId);
  }, [selectedStudentId]);

  async function loadStudentFiles(studentId: number) {
    try {
      const response = await fetch(`${apiUrl}/students/${studentId}/files`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar os arquivos do aluno.');
      }

      const data = (await response.json()) as StudentFile[];
      setStudentFiles(data);
      setFileFeedback('');

      const imageFiles = data.filter((file) => isImageFile(file.anCaminho));
      const urlEntries = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const urlResponse = await fetch(
              `${apiUrl}/students/${studentId}/files/${file.id}/url`,
            );
            if (!urlResponse.ok) {
              return null;
            }
            const urlData = (await urlResponse.json()) as { url: string };
            return [file.id, urlData.url] as const;
          } catch {
            return null;
          }
        }),
      );
      const urls: Record<number, string> = {};
      for (const entry of urlEntries) {
        if (entry) {
          urls[entry[0]] = entry[1];
        }
      }
      setPreviewUrls(urls);
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar arquivos.',
      );
    }
  }

  function clearForm() {
    setSelectedStudentId(null);
    setIsCreating(false);
    setStudentName('');
    setStudentCpf('');
    setStudentBirthDate('');
    setStudentDdd('');
    setStudentPhone('');
    setStudentEmail('');
    setStudentCep('');
    setStudentAddress('');
    setStudentAddressNumber('');
    setStudentPreservados(STUDENT_PRESERVADOS_VAZIO);
    setIsStudentActive(false);
    setStudentErrors({});
    setTouchedStudentFields({});
    setFeedback('');
    setFileFeedback('');
    setStudentFiles([]);
    setPreviewUrls({});
  }

  function handleNewStudent() {
    setSelectedStudentId(null);
    setIsCreating(true);
    setStudentName('');
    setStudentCpf('');
    setStudentBirthDate('');
    setStudentDdd('');
    setStudentPhone('');
    setStudentEmail('');
    setStudentCep('');
    setStudentAddress('');
    setStudentAddressNumber('');
    setStudentPreservados(STUDENT_PRESERVADOS_VAZIO);
    setIsStudentActive(true);
    setFileFeedback('');
    setStudentFiles([]);
  }

  function handleSelectStudent(student: Student) {
    const birthDate = formatDateInput(student.dtNascimento);

    setSelectedStudentId(student.id);
    setIsCreating(false);
    setStudentName(student.nmAluno);
    setStudentCpf(formatCpf(student.caCPF));
    setStudentBirthDate(birthDate);
    setBirthCalendarMonth(displayDateToDate(birthDate) ?? new Date());
    setStudentDdd(student.nrDDD ? String(student.nrDDD) : '');
    setStudentPhone(formatPhone(student.nrContato ?? ''));
    setStudentEmail(student.anEmail);
    setStudentCep(student.anCEP);
    setStudentAddress(student.anLogradouro);
    setStudentAddressNumber(student.nrEndereco ?? '');
    setStudentPreservados({
      anBairro: student.anBairro,
      anComplemento: student.anComplemento,
    });
    setIsStudentActive(student.boInativo === 0);
    setFeedback('');
    setFileFeedback('');
    setStudentErrors({});
    setTouchedStudentFields({});
  }

  function getStudentValidationErrors() {
    const errors: StudentValidationErrors = {};
    const trimmedEmail = studentEmail.trim();

    if (!studentName.trim()) {
      errors.name = 'Informe o nome do aluno.';
    }

    if (!isValidCpf(studentCpf)) {
      errors.cpf = 'Informe um CPF válido.';
    }

    if (!studentBirthDate) {
      errors.birthDate = 'Informe a data de nascimento.';
    } else if (!isValidBirthDate(studentBirthDate)) {
      errors.birthDate = 'Informe uma data de nascimento valida.';
    }

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      errors.email = 'Informe um email válido.';
    }

    return errors;
  }

  function validateStudentField(field: StudentValidationField) {
    const errors = getStudentValidationErrors();

    setTouchedStudentFields((current) => ({
      ...current,
      [field]: true,
    }));
    setStudentErrors((current) => ({
      ...current,
      [field]: errors[field],
    }));

    return !errors[field];
  }

  function focusFirstStudentError(errors: StudentValidationErrors) {
    if (errors.name) {
      nameInputRef.current?.focus();
      return;
    }

    if (errors.cpf) {
      cpfInputRef.current?.focus();
      return;
    }

    if (errors.birthDate) {
      openBirthCalendar();
      return;
    }

    if (errors.email) {
      emailInputRef.current?.focus();
    }
  }

  function openBirthCalendar() {
    if (!isFormEnabled) {
      return;
    }

    setBirthCalendarMonth(displayDateToDate(studentBirthDate) ?? new Date());
    setIsBirthCalendarOpen(true);
  }

  function moveBirthCalendarMonth(direction: number) {
    setBirthCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
  }

  function handleSelectBirthDate(date: Date) {
    setStudentBirthDate(dateToDisplayDate(date));
    setBirthCalendarMonth(date);
    setIsBirthCalendarOpen(false);
    setTouchedStudentFields((current) => ({
      ...current,
      birthDate: true,
    }));
    setStudentErrors((current) => ({
      ...current,
      birthDate: undefined,
    }));
  }

  async function handleToggleStatus() {
    const nextActive = !isStudentActive;
    setIsStudentActive(nextActive);

    if (!selectedStudentId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/students/${selectedStudentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        throw new Error('Não foi possível alterar o status.');
      }

      const updatedStudent = (await response.json()) as Student;
      setStudents((current) =>
        current.map((student) =>
          student.id === updatedStudent.id ? updatedStudent : student,
        ),
      );
    } catch (error) {
      setIsStudentActive(!nextActive);
      setFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  async function handleSaveStudent() {
    try {
      const apiBirthDate = studentBirthDate ? toApiDate(studentBirthDate) : null;
      const trimmedEmail = studentEmail.trim();
      const errors = getStudentValidationErrors();

      if (Object.keys(errors).length > 0) {
        setStudentErrors(errors);
        setTouchedStudentFields({
          birthDate: true,
          cpf: true,
          email: true,
          name: true,
        });
        setFeedback(Object.values(errors)[0] ?? 'Revise os campos destacados.');
        focusFirstStudentError(errors);
        return;
      }

      const payload = {
        // Devolve intacto o que a tela nao mostra.
        ...studentPreservados,
        nmAluno: studentName,
        caCPF: onlyDigits(studentCpf),
        dtNascimento: apiBirthDate,
        nrDDD: Number(studentDdd || 0),
        nrContato: onlyDigits(studentPhone) || null,
        anEmail: trimmedEmail,
        anCEP: studentCep,
        anLogradouro: studentAddress,
        nrEndereco: studentAddressNumber.trim() || null,
        boInativo: isStudentActive ? 0 : 1,
      };
      const response = await fetch(
        selectedStudentId
          ? `${apiUrl}/students/${selectedStudentId}`
          : `${apiUrl}/students`,
        {
          method: selectedStudentId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const savedStudent = (await response.json()) as Student;
      setStudents((current) => {
        if (selectedStudentId) {
          return current.map((student) =>
            student.id === savedStudent.id ? savedStudent : student,
          );
        }

        return [...current, savedStudent].sort((a, b) =>
          a.nmAluno.localeCompare(b.nmAluno),
        );
      });
      setSelectedStudentId(savedStudent.id);
      setIsCreating(false);
      setFeedback('Aluno salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  }

  async function uploadStudentFile(file: {
    name: string;
    type: string;
    uri: string;
  }) {
    if (!selectedStudentId) {
      setFileFeedback('Salve o aluno antes de anexar arquivos.');
      return;
    }

    const formData = new FormData();
    formData.append(
      'file',
      {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as unknown as Blob,
    );

    setIsUploadingFile(true);
    setFileFeedback('');

    const response = await fetch(`${apiUrl}/students/${selectedStudentId}/files`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as { message?: string };
      throw new Error(errorBody.message ?? 'Não foi possível enviar o arquivo.');
    }

    await loadStudentFiles(selectedStudentId);
  }

  async function handlePickStudentFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      await uploadStudentFile({
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      });
      setFileFeedback('Arquivo enviado com sucesso.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar arquivo.',
      );
    } finally {
      setIsUploadingFile(false);
    }
  }

  async function handleOpenCamera() {
    if (!selectedStudentId) {
      setFileFeedback('Salve o aluno antes de anexar fotos.');
      return;
    }

    try {
      let permission = cameraPermission;

      if (!permission?.granted) {
        permission = await requestCameraPermission();
      }

      if (!permission.granted) {
        setFileFeedback('Permissão da câmera não concedida.');
        return;
      }

      setFileFeedback('');
      setIsCameraOpen(true);
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao abrir a câmera.',
      );
    }
  }

  async function handleTakeStudentPhoto() {
    if (!cameraRef.current) {
      return;
    }

    try {
      setIsTakingPhoto(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.78,
        shutterSound: true,
      });

      if (!photo?.uri) {
        throw new Error('Não foi possível capturar a foto.');
      }

      await uploadStudentFile({
        uri: photo.uri,
        name: `aluno-${selectedStudentId}-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
      setIsCameraOpen(false);
      setFileFeedback('Foto enviada com sucesso.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao salvar a foto.',
      );
    } finally {
      setIsTakingPhoto(false);
      setIsUploadingFile(false);
    }
  }

  async function handleOpenStudentFile(fileId: number) {
    if (!selectedStudentId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/students/${selectedStudentId}/files/${fileId}/url`,
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      await Linking.openURL(data.url);
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao abrir arquivo.',
      );
    }
  }

  async function handleRemoveStudentFile(fileId: number) {
    if (!selectedStudentId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/students/${selectedStudentId}/files/${fileId}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível remover o arquivo.');
      }

      await loadStudentFiles(selectedStudentId);
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao remover arquivo.',
      );
    }
  }

  return (
    <ScrollView
      style={styles.productScroller}
      contentContainerStyle={styles.productView}
    >
      <Text style={styles.sectionLabel}>Alunos</Text>
      <Text style={styles.formTitle}>Cadastro de Aluno</Text>
      <Text style={styles.formDescription}>
        Cadastre os dados basicos do aluno para matriculas e acesso ao app.
      </Text>

      <View style={styles.productGridSection}>
        <Text style={styles.sectionLabel}>Alunos</Text>
        <Text style={styles.gridTitle}>Alunos cadastrados</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchTerm}
          placeholder="Buscar aluno"
          placeholderTextColor="#82918a"
          style={styles.searchInput}
          value={searchTerm}
        />
        <Pressable accessibilityRole="button" onPress={handleNewStudent} style={[styles.newButton, { backgroundColor: dark, borderRadius: r }]}>
          <Text style={styles.newButtonText}>Novo aluno</Text>
        </Pressable>

        <View style={styles.productList}>
          {filteredStudents.map((student) => (
            <Pressable accessibilityRole="button"
              key={student.id}
              onPress={() => handleSelectStudent(student)}
              style={[
                styles.productCard,
                { borderRadius: r },
                student.id === selectedStudentId && [styles.productCardSelected, { borderColor: primary }],
              ]}
            >
              <View style={styles.productCardHeader}>
                <Text style={styles.productName}>{student.nmAluno}</Text>
                <Text
                  style={[
                    styles.productStatus,
                    student.boInativo === 0
                      ? styles.productStatusActive
                      : styles.productStatusInactive,
                  ]}
                >
                  {student.boInativo === 0 ? 'Ativo' : 'Inativo'}
                </Text>
              </View>
              <Text style={styles.productStock}>CPF: {formatCpf(student.caCPF)}</Text>
              <Text style={styles.productStock}>Email: {student.anEmail || '-'}</Text>
            </Pressable>
          ))}

          {filteredStudents.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum aluno encontrado.</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.productForm}>
        {!isFormEnabled ? (
          <Text style={styles.formHint}>
            Selecione um aluno acima para editar ou toque em Novo aluno.
          </Text>
        ) : null}

        {feedback ? <Text style={styles.formFeedback}>{feedback}</Text> : null}

        <Text style={styles.label}>Nome *</Text>
        <TextInput
          editable={isFormEnabled}
          ref={nameInputRef}
          maxLength={255}
          onBlur={() => validateStudentField('name')}
          onChangeText={(value) => {
            setStudentName(value);

            if (touchedStudentFields.name) {
              setStudentErrors((current) => ({
                ...current,
                name: value.trim() ? undefined : 'Informe o nome do aluno.',
              }));
            }
          }}
          placeholder="Ex.: Maria Souza"
          placeholderTextColor="#82918a"
          style={[
            styles.input,
            touchedStudentFields.name && studentErrors.name && styles.inputError,
          ]}
          value={studentName}
        />
        {touchedStudentFields.name && studentErrors.name ? (
          <Text style={styles.fieldErrorText}>{studentErrors.name}</Text>
        ) : null}

        <Text style={styles.label}>CPF</Text>
        <TextInput
          editable={isFormEnabled}
          ref={cpfInputRef}
          keyboardType="number-pad"
          maxLength={14}
          onBlur={() => validateStudentField('cpf')}
          onChangeText={(value) => {
            const formattedCpf = formatCpf(value);
            setStudentCpf(formattedCpf);

            if (touchedStudentFields.cpf) {
              setStudentErrors((current) => ({
                ...current,
                cpf: isValidCpf(formattedCpf) ? undefined : 'Informe um CPF válido.',
              }));
            }
          }}
          placeholder="000.000.000-00"
          placeholderTextColor="#82918a"
          style={[
            styles.input,
            touchedStudentFields.cpf && studentErrors.cpf && styles.inputError,
          ]}
          value={studentCpf}
        />
        {touchedStudentFields.cpf && studentErrors.cpf ? (
          <Text style={styles.fieldErrorText}>{studentErrors.cpf}</Text>
        ) : null}

        <Text style={styles.label}>Data de nascimento *</Text>
        <Pressable accessibilityRole="button"
          disabled={!isFormEnabled}
          onPress={openBirthCalendar}
          style={[
            styles.input,
            styles.dateInput,
            touchedStudentFields.birthDate &&
            studentErrors.birthDate &&
            styles.inputError,
            !isFormEnabled && styles.disabledControl,
          ]}
        >
          <Text
            style={[
              styles.dateInputText,
              !studentBirthDate && styles.dateInputPlaceholder,
            ]}
          >
            {studentBirthDate || 'Selecionar data'}
          </Text>
        </Pressable>
        {touchedStudentFields.birthDate && studentErrors.birthDate ? (
          <Text style={styles.fieldErrorText}>{studentErrors.birthDate}</Text>
        ) : null}

        <Modal
          animationType="fade"
          onRequestClose={() => setIsBirthCalendarOpen(false)}
          transparent
          visible={isBirthCalendarOpen}
        >
          <View style={styles.calendarOverlay}>
            <View style={styles.calendarPanel}>
              <View style={styles.calendarHeader}>
                <Pressable accessibilityRole="button"
                  onPress={() => moveBirthCalendarMonth(-1)}
                  style={styles.calendarNavButton}
                >
                  <Text style={styles.calendarNavText}>{'<'}</Text>
                </Pressable>
                <Text style={styles.calendarTitle}>
                  {birthCalendarMonth.toLocaleDateString('pt-BR', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                <Pressable accessibilityRole="button"
                  onPress={() => moveBirthCalendarMonth(1)}
                  style={styles.calendarNavButton}
                >
                  <Text style={styles.calendarNavText}>{'>'}</Text>
                </Pressable>
              </View>

              <View style={styles.calendarWeekdays}>
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((weekday, index) => (
                  <Text key={`${weekday}-${index}`} style={styles.calendarWeekday}>
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {getCalendarDays(birthCalendarMonth).map((date) => {
                  const isCurrentMonth =
                    date.getMonth() === birthCalendarMonth.getMonth();
                  const isSelected =
                    dateToDisplayDate(date) === studentBirthDate;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isFuture = date > today;

                  return (
                    <Pressable accessibilityRole="button"
                      key={date.toISOString()}
                      disabled={isFuture}
                      onPress={() => handleSelectBirthDate(date)}
                      style={[
                        styles.calendarDay,
                        isSelected && styles.calendarDaySelected,
                        isFuture && styles.calendarDayDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          !isCurrentMonth && styles.calendarDayMuted,
                          isFuture && styles.calendarDayMuted,
                          isSelected && styles.calendarDayTextSelected,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable accessibilityRole="button"
                onPress={() => setIsBirthCalendarOpen(false)}
                style={styles.calendarCloseButton}
              >
                <Text style={styles.clearButtonText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Text style={styles.label}>Contato</Text>
        <View style={styles.inlineFields}>
          <TextInput
            editable={isFormEnabled}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={setStudentDdd}
            placeholder="DDD"
            placeholderTextColor="#82918a"
            style={[styles.input, styles.dddInput]}
            value={studentDdd}
          />
          <TextInput
            editable={isFormEnabled}
            keyboardType="phone-pad"
            maxLength={10}
            onChangeText={(value) => setStudentPhone(formatPhone(value))}
            placeholder="00000-0000"
            placeholderTextColor="#82918a"
            style={[styles.input, styles.flexInput]}
            value={studentPhone}
          />
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          editable={isFormEnabled}
          ref={emailInputRef}
          keyboardType="email-address"
          maxLength={100}
          onBlur={() => validateStudentField('email')}
          onChangeText={(value) => {
            setStudentEmail(value);

            if (touchedStudentFields.email) {
              const trimmedEmail = value.trim();
              setStudentErrors((current) => ({
                ...current,
                email:
                  trimmedEmail && !isValidEmail(trimmedEmail)
                    ? 'Informe um email válido.'
                    : undefined,
              }));
            }
          }}
          placeholder="aluno@email.com"
          placeholderTextColor="#82918a"
          style={[
            styles.input,
            touchedStudentFields.email && studentErrors.email && styles.inputError,
          ]}
          value={studentEmail}
        />
        {touchedStudentFields.email && studentErrors.email ? (
          <Text style={styles.fieldErrorText}>{studentErrors.email}</Text>
        ) : null}

        <Text style={styles.label}>Endereço</Text>
        <TextInput
          editable={isFormEnabled}
          maxLength={LIMITES.aluno.anLogradouro}
          onChangeText={setStudentAddress}
          placeholder="Logradouro"
          placeholderTextColor="#82918a"
          style={styles.input}
          value={studentAddress}
        />

        <View style={styles.inlineFields}>
          <TextInput
            editable={isFormEnabled}
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={setStudentCep}
            placeholder="CEP"
            placeholderTextColor="#82918a"
            style={[styles.input, styles.flexInput]}
            value={studentCep}
          />
          {/* A coluna e VarChar(10), nao inteiro: com number-pad e
              `Number(...)` no payload, "123A" e "s/n" nao podiam ser
              digitados. Mesmo ajuste ja feito na tela do web. */}
          <TextInput
            editable={isFormEnabled}
            maxLength={LIMITES.aluno.nrEndereco}
            onChangeText={setStudentAddressNumber}
            placeholder="123A"
            placeholderTextColor="#82918a"
            style={[styles.input, styles.flexInput]}
            value={studentAddressNumber}
          />
        </View>

        <Text style={styles.label}>Status</Text>
        <Pressable accessibilityRole="button"
          disabled={!isFormEnabled}
          onPress={handleToggleStatus}
          style={[
            styles.statusToggle,
            !isFormEnabled && styles.disabledControl,
          ]}
        >
          <View
            style={[
              styles.statusToggleThumb,
              isStudentActive && [styles.statusToggleThumbActive, { backgroundColor: primary }],
            ]}
          >
            <Text style={styles.statusToggleText}>
              {isStudentActive ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.formActions}>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={clearForm}
            style={[styles.clearButton, !isFormEnabled && styles.disabledControl]}
          >
            <Text style={styles.clearButtonText}>Limpar</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            disabled={!isFormEnabled}
            onPress={handleSaveStudent}
            style={[styles.saveButton, { backgroundColor: primary, borderRadius: r }, !isFormEnabled && styles.disabledControl]}
          >
            <Text style={styles.saveButtonText}>Salvar aluno</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.productForm}>
        <Text style={styles.sectionLabel}>Arquivos</Text>
        <Text style={styles.gridTitle}>Arquivos do aluno</Text>

        {!selectedStudentId ? (
          <Text style={styles.formHint}>
            Salve ou selecione um aluno para anexar arquivos.
          </Text>
        ) : null}

        {fileFeedback ? <Text style={styles.formFeedback}>{fileFeedback}</Text> : null}

        <View style={styles.fileActionGroup}>
          <Pressable accessibilityRole="button"
            disabled={!selectedStudentId || isUploadingFile}
            onPress={handlePickStudentFile}
            style={[
              styles.fileButton,
              (!selectedStudentId || isUploadingFile) && styles.disabledControl,
            ]}
          >
            <Text style={styles.fileButtonText}>
              {isUploadingFile ? 'Enviando...' : 'Selecionar arquivo'}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="button"
            disabled={!selectedStudentId || isUploadingFile}
            onPress={handleOpenCamera}
            style={[
              styles.cameraButton,
              (!selectedStudentId || isUploadingFile) && styles.disabledControl,
            ]}
          >
            <Text style={styles.cameraButtonText}>Usar câmera</Text>
          </Pressable>
        </View>

        <View style={styles.studentFileList}>
          {studentFiles.map((file) => (
            <View key={file.id} style={styles.studentFileCard}>
              {previewUrls[file.id] ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: previewUrls[file.id] }}
                  style={styles.studentFilePreview}
                />
              ) : null}
              <Text numberOfLines={1} style={styles.studentFileName}>
                {file.anCaminho.split('/').pop()}
              </Text>
              <Text numberOfLines={2} style={styles.studentFilePath}>
                {file.anCaminho}
              </Text>
              <View style={styles.studentFileActions}>
                <Pressable accessibilityRole="button"
                  onPress={() => void handleOpenStudentFile(file.id)}
                  style={styles.fileSecondaryButton}
                >
                  <Text style={styles.fileSecondaryButtonText}>Abrir</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  onPress={() => void handleRemoveStudentFile(file.id)}
                  style={styles.fileDangerButton}
                >
                  <Text style={styles.fileDangerButtonText}>Remover</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {selectedStudentId && studentFiles.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum arquivo anexado.</Text>
          ) : null}
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsCameraOpen(false)}
        visible={isCameraOpen}
      >
        <View style={styles.cameraScreen}>
          <CameraView
            active={isCameraOpen}
            facing={cameraFacing}
            mode="picture"
            ref={cameraRef}
            style={styles.cameraPreview}
          />
          <View style={styles.cameraControls}>
            <Pressable accessibilityRole="button"
              onPress={() => setIsCameraOpen(false)}
              style={styles.cameraControlButton}
            >
              <Text style={styles.cameraControlText}>Cancelar</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              disabled={isTakingPhoto || isUploadingFile}
              onPress={handleTakeStudentPhoto}
              style={[
                styles.cameraCaptureButton,
                (isTakingPhoto || isUploadingFile) && styles.disabledControl,
              ]}
            >
              <Text style={styles.cameraCaptureText}>
                {isTakingPhoto || isUploadingFile ? 'Salvando...' : 'Foto'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              onPress={() =>
                setCameraFacing((current) =>
                  current === 'back' ? 'front' : 'back',
                )
              }
              style={styles.cameraControlButton}
            >
              <Text style={styles.cameraControlText}>Virar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Resposta minimizada de /auth/register-lookup (endpoint publico). CPF, data de
// nascimento e telefone nao sao mais devolvidos, e o email vem MASCARADO
// (`emailMask`): o endereco completo e exigido no /auth/register e conferido no
// servidor, entao nao pode ser entregue aqui a quem so descobriu o CPF.
type RegisterLookupRecord = {
  id: number;
  type: 'student' | 'employee';
  name: string;
  emailMask: string;
  hasUser: boolean;
};

export default function HomeScreen() {
  const appTheme = useTheme();
  const primary = appTheme?.corPrimaria ?? '#1f7a53';
  const bg = appTheme?.corFundo ?? '#f3f6f4';
  const dark = appTheme?.corTexto ?? '#17211c';
  const r = appTheme?.raioCardBorder ?? 8;
  const { setCurrentClient } = useCurrentClient();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('HOME');
  const [activeRegistration, setActiveRegistration] =
    useState<RegistrationScreen | null>(null);
  const [authUserName, setAuthUserName] = useState('');
  const [authUserRole, setAuthUserRole] = useState('');
  const [loginMode, setLoginMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginCpf, setLoginCpf] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [forgotCpf, setForgotCpf] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [registerType, setRegisterType] = useState<'student' | 'employee'>('student');
  const [registerCpf, setRegisterCpf] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerLookup, setRegisterLookup] = useState<RegisterLookupRecord | null>(null);
  const [registerLookupFeedback, setRegisterLookupFeedback] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [authFeedback, setAuthFeedback] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isLookingUpRegister, setIsLookingUpRegister] = useState(false);
  const passwordRequirements = [
    { label: 'Pelo menos 1 número', met: /\d/.test(registerPassword) },
    { label: 'Pelo menos 3 letras', met: (registerPassword.match(/[a-zA-Z]/g) ?? []).length >= 3 },
    { label: 'Pelo menos 6 caracteres', met: registerPassword.length >= 6 },
    { label: 'No maximo 20 caracteres', met: registerPassword.length > 0 && registerPassword.length <= 20 },
    { label: 'Sem espaços', met: registerPassword.length > 0 && !/\s/.test(registerPassword) },
  ];
  const [selectedDomain, setSelectedDomain] = useState<DomainItem>(domainItems[0]);
  const [domainRecords, setDomainRecords] = useState<DomainRecord[]>([]);
  const [domainSearch, setDomainSearch] = useState('');
  const [selectedDomainRecordId, setSelectedDomainRecordId] = useState<number | null>(null);
  const [isCreatingDomainRecord, setIsCreatingDomainRecord] = useState(false);
  const [domainName, setDomainName] = useState('');
  const [domainDescription, setDomainDescription] = useState('');
  const [isDomainRecordActive, setIsDomainRecordActive] = useState(false);
  const [domainFeedback, setDomainFeedback] = useState('');
  const currentDomainConfig =
    domainConfig[selectedDomain as keyof typeof domainConfig];

  async function lookupRegisterCpf(type = registerType, cpfValue = registerCpf) {
    const cpf = cpfValue.replace(/\D/g, '');

    setRegisterLookup(null);
    setRegisterLookupFeedback('');

    if (!cpf) return;

    if (cpf.length !== 11 || !isValidCpf(cpf)) {
      setRegisterLookupFeedback('Informe um CPF válido para buscar o cadastro.');
      return;
    }

    try {
      setIsLookingUpRegister(true);
      const response = await fetch(
        `${apiUrl}/auth/register-lookup?type=${type}&cpf=${cpf}`,
      );
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'CPF não encontrado.');
      }

      const data = (await response.json()) as RegisterLookupRecord;
      setRegisterLookup(data);
      setRegisterLookupFeedback(
        data.hasUser
          ? 'Este CPF já possui usuário cadastrado.'
          : // Sem email na ficha nao ha como provar a titularidade do cadastro,
            // entao o auto-cadastro nao pode prosseguir: o servidor recusa e o
            // aviso evita que a pessoa fique tentando sem entender o motivo.
            !data.emailMask
            ? 'Seu cadastro não tem e-mail registrado. Procure a recepção da academia para concluir o acesso.'
            : 'Cadastro encontrado. Confirme o email do cadastro e crie sua senha.',
      );
    } catch (error) {
      setRegisterLookupFeedback(
        error instanceof Error ? error.message : 'CPF não encontrado no cadastro.',
      );
    } finally {
      setIsLookingUpRegister(false);
    }
  }

  function handleChangeRegisterType(type: 'student' | 'employee') {
    setRegisterType(type);
    setRegisterLookup(null);
    setRegisterLookupFeedback('');

    if (registerCpf.replace(/\D/g, '').length === 11) {
      void lookupRegisterCpf(type, registerCpf);
    }
  }

  async function handleLogin() {
    setAuthFeedback('');

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: loginCpf.replace(/\D/g, ''),
          password: loginPassword,
          client: 'mobile',
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível entrar.');
      }

      const { token, ...user } = (await response.json()) as {
        name: string;
        type: 'student' | 'employee';
        clientId?: number;
        token?: string;
      };
      await setAuthToken(token ?? null);
      setAuthUserName(user.name);
      setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');

      // Salvar clientId se API retornar, caso contrário buscar o primeiro cliente
      if (user.clientId) {
        await setCurrentClient(user.clientId);
      } else {
        try {
          const clientsResponse = await fetch(`${apiUrl}/clients`);
          if (clientsResponse.ok) {
            const clients = (await clientsResponse.json()) as Array<{ id: number }>;
            const first = clients[0];
            if (first) {
              await setCurrentClient(first.id);
            }
          }
        } catch {
          // Se não conseguir buscar clientes, continua mesmo assim
          console.warn('Não foi possível carregar clientes');
        }
      }

      setIsLoggedIn(true);
      setActiveTab('HOME');
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Erro ao entrar.');
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleForgotPassword() {
    setAuthFeedback('');
    setForgotEmail('');

    try {
      setIsSubmittingAuth(true);
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: forgotCpf.replace(/\D/g, '') }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível enviar o email.');
      }

      const data = (await response.json()) as { email: string; message: string };
      setForgotEmail(data.email);
      setAuthFeedback(data.message);
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar e-mail de redefinição.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleRegister() {
    setAuthFeedback('');

    const passwordMessage = getPasswordValidationMessage(registerPassword);

    if (passwordMessage) {
      setAuthFeedback(passwordMessage);
      return;
    }

    if (!registerLookup || registerLookup.hasUser) {
      setRegisterLookupFeedback('Busque um CPF cadastrado e disponível antes de criar o usuário.');
      return;
    }

    const typedEmail = registerEmail.trim();
    if (!typedEmail) {
      setAuthFeedback('Informe o email do seu cadastro.');
      return;
    }
    // So a presenca era conferida: um email malformado ia ate o servidor para
    // voltar com a mesma mensagem, gastando uma das tentativas do rate limit.
    if (!isValidEmail(typedEmail)) {
      setAuthFeedback('Informe um email válido.');
      return;
    }

    try {
      setIsSubmittingAuth(true);
      const payload = {
        type: registerType,
        cpf: registerCpf.replace(/\D/g, ''),
        // Digitado pelo titular e conferido no servidor contra o cadastro: so o
        // CPF (dado publico no Brasil) nao basta mais para criar a conta.
        email: typedEmail,
        password: registerPassword,
      };

      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível criar o cadastro.');
      }

      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: payload.cpf, password: payload.password, client: 'mobile' }),
      });

      if (!loginResponse.ok) {
        const errorBody = (await loginResponse.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Cadastro criado, mas não foi possível entrar automaticamente.');
      }

      const { token, ...user } = (await loginResponse.json()) as {
        name: string;
        type: 'student' | 'employee';
        token?: string;
      };
      await setAuthToken(token ?? null);
      setRegisterCpf('');
      setRegisterLookup(null);
      setRegisterLookupFeedback('');
      setRegisterPassword('');
      setShowRegisterPassword(false);
      setAuthFeedback('');
      setAuthUserName(user.name);
      setAuthUserRole(user.type === 'student' ? 'Aluno' : 'Funcionário');
      setIsLoggedIn(true);
      setActiveTab('HOME');
    } catch (error) {
      setAuthFeedback(
        error instanceof Error ? error.message : 'Erro ao criar cadastro.',
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function loadDomainRecords() {
    const config = currentDomainConfig;
    if (!config) return;

    try {
      const response = await fetch(`${apiUrl}/${config.endpoint}`);

      if (!response.ok) {
        throw new Error('Não foi possível carregar o domínio.');
      }

      const data = (await response.json()) as Array<Record<string, unknown>>;
      setDomainRecords(
        data.map((item) => {
          const secondField = config.secondField;
          const description =
            secondField && item[secondField] ? String(item[secondField]) : '';

          return {
            id: Number(item.id),
            name: String(item[config.field] ?? ''),
            description,
            boInativo: Number(item.boInativo ?? 0),
          };
        }),
      );
      setDomainFeedback('');
    } catch (error) {
      setDomainFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar domínio.',
      );
      setDomainRecords([]);
      clearDomainForm();
    }
  }

  function clearDomainForm() {
    setSelectedDomainRecordId(null);
    setIsCreatingDomainRecord(false);
    setDomainName('');
    setDomainDescription('');
    setIsDomainRecordActive(false);
  }

  function handleNewDomainRecord() {
    setSelectedDomainRecordId(null);
    setIsCreatingDomainRecord(true);
    setDomainName('');
    setDomainDescription('');
    setIsDomainRecordActive(true);
    setDomainFeedback('');
  }

  function handleSelectDomainRecord(record: DomainRecord) {
    setSelectedDomainRecordId(record.id);
    setIsCreatingDomainRecord(false);
    setDomainName(record.name);
    setDomainDescription(record.description ?? '');
    setIsDomainRecordActive(record.boInativo === 0);
    setDomainFeedback('');
  }

  async function handleToggleDomainRecordStatus() {
    const config = currentDomainConfig;
    if (!config || !selectedDomainRecordId) return;
    const nextActive = !isDomainRecordActive;
    setIsDomainRecordActive(nextActive);

    try {
      const response = await fetch(`${apiUrl}/${config.endpoint}/${selectedDomainRecordId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        throw new Error('Não foi possível alterar o status.');
      }

      const updated = (await response.json()) as Record<string, unknown>;
      setDomainRecords((current) =>
        current.map((record) => {
          const secondField = config.secondField;
          const updatedDescription =
            secondField && updated[secondField] ? String(updated[secondField]) : '';

          return record.id === Number(updated.id)
            ? {
              id: Number(updated.id),
              name: String(updated[config.field] ?? ''),
              description: updatedDescription,
              boInativo: Number(updated.boInativo ?? 0),
            }
            : record;
        }),
      );
    } catch (error) {
      setIsDomainRecordActive(!nextActive);
      setDomainFeedback(
        error instanceof Error ? error.message : 'Erro ao alterar status.',
      );
    }
  }

  async function handleSaveDomainRecord() {
    const config = currentDomainConfig;
    if (!config) return;
    try {
      const payload: Record<string, unknown> = {
        [config.field]: domainName,
        boInativo: isDomainRecordActive ? 0 : 1,
      };
      if (config.secondField) {
        payload[config.secondField] = domainDescription;
      }

      const response = await fetch(
        selectedDomainRecordId
          ? `${apiUrl}/${config.endpoint}/${selectedDomainRecordId}`
          : `${apiUrl}/${config.endpoint}`,
        {
          method: selectedDomainRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar.');
      }

      const saved = (await response.json()) as Record<string, unknown>;
      const secondField = config.secondField;
      const mapped: DomainRecord = {
        id: Number(saved.id),
        name: String(saved[config.field] ?? ''),
        description: secondField && saved[secondField] ? String(saved[secondField]) : '',
        boInativo: Number(saved.boInativo ?? 0),
      };

      setDomainRecords((current) => {
        if (selectedDomainRecordId) {
          return current.map((record) =>
            record.id === mapped.id ? mapped : record,
          );
        }

        return [...current, mapped].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      });
      setSelectedDomainRecordId(mapped.id);
      setIsCreatingDomainRecord(false);
      setDomainFeedback(`${config.label} salvo com sucesso.`);
    } catch (error) {
      setDomainFeedback(
        error instanceof Error ? error.message : 'Erro ao salvar.',
      );
    }
  }

  useEffect(() => {
    if (activeRegistration === 'Dominios' && currentDomainConfig) {
      void loadDomainRecords();
    }
  }, [activeRegistration, selectedDomain, currentDomainConfig]);

  useEffect(() => {
    setDomainRecords([]);
    setDomainSearch('');
    setDomainFeedback('');
    clearDomainForm();
  }, [selectedDomain]);

  function renderContent() {
    if (activeTab === 'HOME') {
      return (
        <ScrollView
          style={styles.screenScroller}
          contentContainerStyle={styles.homeContent}
        >
          <View style={[styles.logo, { backgroundColor: primary, borderRadius: r }]}>
            <Text style={styles.logoText}>SG</Text>
          </View>
          <Text style={[styles.sectionLabel, { color: primary }]}>SmartGym</Text>
          <Text style={styles.selectedTitle}>Painel principal</Text>
          <Text style={styles.selectedText}>
            Acompanhe os módulos da academia e acesse os cadastros pela barra
            inferior.
          </Text>

          <View style={styles.summaryCard}>
            <Text style={styles.gridTitle}>Academia Cliente</Text>
            <Text style={styles.selectedText}>Usuário: João Silva</Text>
            <Text style={styles.selectedText}>Perfil: Administrador</Text>
          </View>
        </ScrollView>
      );
    }

    if (activeTab === 'EMPRESA') {
      return (
        <ScrollView
          style={styles.screenScroller}
          contentContainerStyle={styles.homeContent}
        >
          <View style={[styles.logo, { backgroundColor: primary, borderRadius: r }]}>
            <Text style={styles.logoText}>SG</Text>
          </View>
          <Text style={[styles.sectionLabel, { color: primary }]}>Empresa</Text>
          <Text style={styles.selectedTitle}>Academia Cliente</Text>
          <Text style={styles.selectedText}>
            Informações principais da empresa ativa na plataforma SmartGym.
          </Text>

          <View style={styles.summaryCard}>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.selectLikeText}>Academia Cliente</Text>
            <Text style={styles.label}>Tema</Text>
            <Text style={styles.selectLikeText}>Padrao SmartGym</Text>
          </View>
        </ScrollView>
      );
    }

    if (activeTab === 'CADASTROS') {
      const registrationContent =
        activeRegistration === 'Empresas Cadastro' ? (
          <CompanyRegistration />
        ) : activeRegistration === 'Produtos Cadastro' ? (
          <ProductRegistration />
        ) : activeRegistration === 'Matriculas' ? (
          <StudentRegistration />
        ) : activeRegistration === 'Dominios' ? (
          <ScrollView
            style={styles.productScroller}
            contentContainerStyle={styles.productView}
          >
            <Text style={styles.sectionLabel}>Domínios</Text>
            <Text style={styles.formTitle}>Cadastro de Domínios</Text>
            <Text style={styles.formDescription}>
              Tabelas de apoio para tipos e configuracoes gerais.
            </Text>
            <View style={styles.productList}>
              {domainItems.map((domain) => (
                <Pressable accessibilityRole="button"
                  key={domain}
                  onPress={() => setSelectedDomain(domain)}
                  style={[
                    styles.productCard,
                    selectedDomain === domain && styles.productCardSelected,
                  ]}
                >
                  <View style={styles.productCardHeader}>
                    <Text style={styles.productName}>{domain}</Text>
                    <Text style={[styles.productStatus, styles.productStatusActive]}>
                      Ativo
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {currentDomainConfig ? (
              <>
                <View style={styles.productGridSection}>
                  <Text style={styles.sectionLabel}>{selectedDomain}</Text>
                  <Text style={styles.gridTitle}>Itens cadastrados</Text>
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setDomainSearch}
                    placeholder="Buscar item"
                    placeholderTextColor="#82918a"
                    style={styles.searchInput}
                    value={domainSearch}
                  />
                  <Pressable accessibilityRole="button" onPress={handleNewDomainRecord} style={[styles.newButton, { backgroundColor: dark, borderRadius: r }]}>
                    <Text style={styles.newButtonText}>Novo</Text>
                  </Pressable>

                  <View style={styles.productList}>
                    {domainRecords
                      .filter((record) =>
                        record.name.toLowerCase().includes(domainSearch.toLowerCase()),
                      )
                      .map((record) => (
                        <Pressable accessibilityRole="button"
                          key={record.id}
                          onPress={() => handleSelectDomainRecord(record)}
                          style={[
                            styles.productCard,
                            { borderRadius: r },
                            record.id === selectedDomainRecordId && [styles.productCardSelected, { borderColor: primary }],
                          ]}
                        >
                          <View style={styles.productCardHeader}>
                            <Text style={styles.productName}>{record.name}</Text>
                            <Text
                              style={[
                                styles.productStatus,
                                record.boInativo === 0
                                  ? styles.productStatusActive
                                  : styles.productStatusInactive,
                              ]}
                            >
                              {record.boInativo === 0 ? 'Ativo' : 'Inativo'}
                            </Text>
                          </View>
                          {record.description ? (
                            <Text style={styles.productStock}>{record.description}</Text>
                          ) : null}
                        </Pressable>
                      ))}
                  </View>
                </View>

                <View style={styles.productForm}>
                  {domainFeedback ? (
                    <Text style={styles.formFeedback}>{domainFeedback}</Text>
                  ) : null}
                  {!isCreatingDomainRecord && !selectedDomainRecordId ? (
                    <Text style={styles.formHint}>
                      Selecione um item acima ou toque em Novo.
                    </Text>
                  ) : null}
                  <Text style={styles.label}>{currentDomainConfig.label}</Text>
                  <TextInput
                    editable={isCreatingDomainRecord || selectedDomainRecordId !== null}
                    maxLength={LIMITES.auxiliar.padrao}
                    onChangeText={setDomainName}
                    placeholder="Digite aqui"
                    placeholderTextColor="#82918a"
                    style={styles.input}
                    value={domainName}
                  />
                  {currentDomainConfig.secondField ? (
                    <>
                      <Text style={styles.label}>
                        {currentDomainConfig.secondFieldLabel}
                      </Text>
                      <TextInput
                        editable={isCreatingDomainRecord || selectedDomainRecordId !== null}
                        maxLength={LIMITES.auxiliar.padrao}
                        onChangeText={setDomainDescription}
                        placeholder="Digite aqui"
                        placeholderTextColor="#82918a"
                        style={styles.input}
                        value={domainDescription}
                      />
                    </>
                  ) : null}
                  <Text style={styles.label}>Status</Text>
                  <Pressable accessibilityRole="button"
                    disabled={!isCreatingDomainRecord && !selectedDomainRecordId}
                    onPress={handleToggleDomainRecordStatus}
                    style={[
                      styles.statusToggle,
                      !isCreatingDomainRecord &&
                      !selectedDomainRecordId &&
                      styles.disabledControl,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusToggleThumb,
                        isDomainRecordActive && [styles.statusToggleThumbActive, { backgroundColor: primary }],
                      ]}
                    >
                      <Text style={styles.statusToggleText}>
                        {isDomainRecordActive ? 'Ativo' : 'Inativo'}
                      </Text>
                    </View>
                  </Pressable>
                  <View style={styles.formActions}>
                    <Pressable accessibilityRole="button"
                      disabled={!isCreatingDomainRecord && !selectedDomainRecordId}
                      onPress={clearDomainForm}
                      style={[
                        styles.clearButton,
                        !isCreatingDomainRecord &&
                        !selectedDomainRecordId &&
                        styles.disabledControl,
                      ]}
                    >
                      <Text style={styles.clearButtonText}>Limpar</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button"
                      disabled={!isCreatingDomainRecord && !selectedDomainRecordId}
                      onPress={handleSaveDomainRecord}
                      style={[
                        styles.saveButton,
                        { backgroundColor: primary, borderRadius: r },
                        !isCreatingDomainRecord &&
                        !selectedDomainRecordId &&
                        styles.disabledControl,
                      ]}
                    >
                      <Text style={styles.saveButtonText}>
                        {currentDomainConfig.saveLabel}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.productForm}>
                <Text style={styles.formHint}>
                  Dominio selecionado: {selectedDomain}
                </Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.placeholderView}>
            <Text style={styles.sectionLabel}>Cadastro selecionado</Text>
            <Text style={styles.selectedTitle}>{activeRegistration}</Text>
            <Text style={styles.selectedText}>
              Esta tela vai receber o formulario deste modulo conforme
              avançarmos os próximos cadastros.
            </Text>
          </View>
        );

      if (!activeRegistration) {
        return (
          <ScrollView
            style={styles.screenScroller}
            contentContainerStyle={styles.registrationMenu}
          >
            <Text style={styles.sectionLabel}>Cadastros</Text>
            <Text style={styles.selectedTitle}>Selecione um modulo</Text>

            <View style={styles.registrationGrid}>
              {registrationScreens.map((screen) => {
                const info = registrationInfo[screen];
                const isReady =
                  screen === 'Empresas Cadastro' ||
                  screen === 'Produtos Cadastro' ||
                  screen === 'Matriculas' ||
                  screen === 'Dominios';

                return (
                  <Pressable accessibilityRole="button"
                    key={screen}
                    onPress={() => setActiveRegistration(screen)}
                    style={[
                      styles.registrationCard,
                      { borderTopColor: info.accent },
                    ]}
                  >
                    <View
                      style={[
                        styles.registrationBadge,
                        { backgroundColor: info.accent },
                      ]}
                    >
                      <Text style={styles.registrationBadgeText}>
                        {info.shortLabel}
                      </Text>
                    </View>

                    <Text style={styles.registrationGroup}>{info.group}</Text>
                    <Text
                      numberOfLines={2}
                      style={styles.registrationCardText}
                    >
                      {info.title}
                    </Text>
                    <Text
                      style={[
                        styles.registrationStatus,
                        isReady && styles.registrationStatusReady,
                      ]}
                    >
                      {isReady ? 'Disponivel' : 'Em breve'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        );
      }

      return (
        <View style={styles.registrationScreen}>
          <Pressable accessibilityRole="button"
            onPress={() => setActiveRegistration(null)}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>Voltar</Text>
          </Pressable>

          {registrationContent}
        </View>
      );
    }

    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.card}>
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: primary, borderRadius: r }]}>
              <Text style={styles.logoText}>SG</Text>
            </View>
            <View>
              <Text style={[styles.eyebrow, { color: primary }]}>SmartGym</Text>
              <Text style={styles.title}>Sua conta</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Usuário</Text>
            <View style={styles.selectLike}>
              <Text style={styles.selectLikeText}>{authUserName}</Text>
            </View>
            <Text style={styles.label}>Perfil</Text>
            <View style={styles.selectLike}>
              <Text style={styles.selectLikeText}>{authUserRole}</Text>
            </View>
            <Pressable accessibilityRole="button"
              onPress={async () => {
                await setCurrentClient(null);
                setIsLoggedIn(false);
                setActiveTab('HOME');
              }}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Sair</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={[styles.appShell, { backgroundColor: bg }]}>
        <ScrollView contentContainerStyle={styles.loginScroller}>
          <View style={styles.card}>
            <View style={styles.brand}>
              <View style={[styles.logo, { backgroundColor: primary, borderRadius: r }]}>
                <Text style={styles.logoText}>SG</Text>
              </View>
              <View>
                <Text style={[styles.eyebrow, { color: primary }]}>SmartGym</Text>
                <Text style={styles.title}>
                  {loginMode === 'login'
                    ? 'Entrar na sua conta'
                    : loginMode === 'register'
                      ? 'Criar cadastro'
                      : 'Redefinir senha'}
                </Text>
              </View>
            </View>

            {loginMode !== 'forgot' ? (
              <View style={styles.loginModeToggle}>
                <Pressable accessibilityRole="button"
                  onPress={() => {
                    setLoginMode('login');
                    setAuthFeedback('');
                    setForgotEmail('');
                  }}
                  style={[styles.loginModeButton, loginMode === 'login' && styles.loginModeButtonActive]}
                >
                  <Text style={[styles.loginModeText, loginMode === 'login' && styles.loginModeTextActive]}>Entrar</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  onPress={() => {
                    setLoginMode('register');
                    setAuthFeedback('');
                    setForgotEmail('');
                  }}
                  style={[styles.loginModeButton, loginMode === 'register' && styles.loginModeButtonActive]}
                >
                  <Text style={[styles.loginModeText, loginMode === 'register' && styles.loginModeTextActive]}>Criar cadastro</Text>
                </Pressable>
              </View>
            ) : null}

            {authFeedback ? (
              <View style={styles.authFeedback}>
                <Text style={styles.authFeedbackText}>{authFeedback}</Text>
              </View>
            ) : null}

            {loginMode === 'login' ? (
              <View style={styles.form}>
                <Text style={styles.label}>CPF</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="username"
                  keyboardType="numeric"
                  onChangeText={(value) => setLoginCpf(formatCpf(value))}
                  placeholder="000.000.000-00"
                  placeholderTextColor="#82918a"
                  style={styles.input}
                  value={loginCpf}
                />

                <Text style={styles.label}>Senha</Text>
                <View style={styles.passwordField}>
                  <TextInput
                    autoComplete="current-password"
                    onChangeText={setLoginPassword}
                    placeholder="Digite sua senha"
                    placeholderTextColor="#82918a"
                    secureTextEntry={!showLoginPassword}
                    style={[styles.input, styles.passwordInput]}
                    value={loginPassword}
                  />
                  <Pressable accessibilityRole="button"
                    onPress={() => setShowLoginPassword((current) => !current)}
                    style={styles.passwordEyeButton}
                  >
                    <Text style={styles.passwordEyeText}>{showLoginPassword ? 'Ocultar' : 'Ver'}</Text>
                  </Pressable>
                </View>

                <Pressable accessibilityRole="button"
                  onPress={() => {
                    setLoginMode('forgot');
                    setAuthFeedback('');
                    setForgotEmail('');
                  }}
                  style={styles.forgotButton}
                >
                  <Text style={styles.forgotText}>Esqueci minha senha</Text>
                </Pressable>

                <Pressable accessibilityRole="button"
                  disabled={isSubmittingAuth}
                  onPress={() => void handleLogin()}
                  style={[styles.submitButton, { backgroundColor: primary, borderRadius: r }, isSubmittingAuth && styles.disabledControl]}
                >
                  <Text style={styles.submitText}>{isSubmittingAuth ? 'Entrando...' : 'Entrar'}</Text>
                </Pressable>
              </View>
            ) : loginMode === 'forgot' ? (
              <View style={styles.form}>
                <Text style={styles.label}>CPF</Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="numeric"
                  onChangeText={(value) => {
                    setForgotCpf(formatCpf(value));
                    setForgotEmail('');
                    setAuthFeedback('');
                  }}
                  placeholder="000.000.000-00"
                  placeholderTextColor="#82918a"
                  style={styles.input}
                  value={forgotCpf}
                />

                {forgotEmail ? (
                  <>
                    <Text style={styles.label}>Email cadastrado</Text>
                    <View style={styles.lockedValue}>
                      <Text style={styles.lockedValueText}>{forgotEmail}</Text>
                    </View>
                  </>
                ) : null}

                <Pressable accessibilityRole="button"
                  disabled={isSubmittingAuth}
                  onPress={() => void handleForgotPassword()}
                  style={[styles.submitButton, { backgroundColor: primary, borderRadius: r }, isSubmittingAuth && styles.disabledControl]}
                >
                  <Text style={styles.submitText}>{isSubmittingAuth ? 'Enviando...' : 'Enviar e-mail de redefinição'}</Text>
                </Pressable>

                <Pressable accessibilityRole="button"
                  onPress={() => {
                    setLoginMode('login');
                    setAuthFeedback('');
                    setForgotEmail('');
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Voltar para entrar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>CPF</Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="numeric"
                  onChangeText={(value) => {
                    const formatted = formatCpf(value);
                    setRegisterCpf(formatted);
                    setRegisterLookup(null);
                    setRegisterLookupFeedback('');

                    if (formatted.replace(/\D/g, '').length === 11) {
                      void lookupRegisterCpf(registerType, formatted);
                    }
                  }}
                  placeholder="000.000.000-00"
                  placeholderTextColor="#82918a"
                  style={styles.input}
                  value={registerCpf}
                />

                <View style={styles.loginModeToggle}>
                  <Pressable accessibilityRole="button"
                    onPress={() => handleChangeRegisterType('student')}
                    style={[styles.loginModeButton, registerType === 'student' && styles.loginModeButtonActive]}
                  >
                    <Text style={[styles.loginModeText, registerType === 'student' && styles.loginModeTextActive]}>Aluno</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button"
                    onPress={() => handleChangeRegisterType('employee')}
                    style={[styles.loginModeButton, registerType === 'employee' && styles.loginModeButtonActive]}
                  >
                    <Text style={[styles.loginModeText, registerType === 'employee' && styles.loginModeTextActive]}>Funcionário</Text>
                  </Pressable>
                </View>

                {registerLookupFeedback ? (
                  <View style={styles.authFeedback}>
                    <Text style={styles.authFeedbackText}>{registerLookupFeedback}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>Nome</Text>
                <View style={styles.lockedValue}>
                  <Text style={styles.lockedValueText}>{registerLookup?.name ?? ''}</Text>
                </View>

                {/* Data de nascimento, DDD e telefone sairam daqui: o
                    /auth/register-lookup e publico e parou de devolver esses
                    campos para nao virar fonte de PII a partir de um CPF. */}

                <Text style={styles.label}>Email do cadastro</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  maxLength={LIMITES.aluno.anEmail}
                  onChangeText={setRegisterEmail}
                  placeholder={registerLookup?.emailMask || 'email cadastrado na academia'}
                  style={styles.input}
                  value={registerEmail}
                />
                {registerLookup?.emailMask ? (
                  <Text style={styles.helperText}>
                    Confirme o email do seu cadastro ({registerLookup.emailMask}).
                  </Text>
                ) : null}

                <Text style={styles.label}>Senha</Text>
                <View style={styles.passwordField}>
                  <TextInput
                    autoComplete="new-password"
                    maxLength={20}
                    onChangeText={setRegisterPassword}
                    placeholder="6 a 20 caracteres, com numero"
                    placeholderTextColor="#82918a"
                    secureTextEntry={!showRegisterPassword}
                    style={[styles.input, styles.passwordInput]}
                    value={registerPassword}
                  />
                  <Pressable accessibilityRole="button"
                    onPress={() => setShowRegisterPassword((current) => !current)}
                    style={styles.passwordEyeButton}
                  >
                    <Text style={styles.passwordEyeText}>{showRegisterPassword ? 'Ocultar' : 'Ver'}</Text>
                  </Pressable>
                </View>

                <View style={styles.passwordChecklist}>
                  {passwordRequirements.map((req) => (
                    <Text key={req.label} style={[styles.passwordCheckItem, req.met && styles.passwordCheckItemMet]}>
                      {req.met ? '✓' : '•'} {req.label}
                    </Text>
                  ))}
                </View>

                <Pressable accessibilityRole="button"
                  disabled={isSubmittingAuth || isLookingUpRegister || !registerLookup || registerLookup.hasUser}
                  onPress={() => void handleRegister()}
                  style={[styles.submitButton, { backgroundColor: primary, borderRadius: r }, (isSubmittingAuth || isLookingUpRegister || !registerLookup || registerLookup?.hasUser) && styles.disabledControl]}
                >
                  <Text style={styles.submitText}>
                    {isSubmittingAuth ? 'Criando...' : isLookingUpRegister ? 'Buscando...' : 'Criar cadastro'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.appShell, { backgroundColor: bg }]}>
      <View style={styles.tabContent}>{renderContent()}</View>

      <View style={styles.bottomNav}>
        {appTabs.map((tab) => (
          <Pressable accessibilityRole="button"
            key={tab}
            onPress={() => {
              setActiveTab(tab);

              if (tab === 'CADASTROS') {
                setActiveRegistration(null);
              }
            }}
            style={[
              styles.bottomNavButton,
              tab === activeTab && [styles.bottomNavButtonActive, { backgroundColor: `${primary}22` }],
            ]}
          >
            {tab === 'EMPRESA' ? (
              <View
                style={[
                  styles.bottomIcon,
                  tab === activeTab && [styles.bottomIconActive, { backgroundColor: primary }],
                ]}
              >
                <Text
                  style={[
                    styles.bottomIconText,
                    tab === activeTab && styles.bottomIconTextActive,
                  ]}
                >
                  SG
                </Text>
              </View>
            ) : tab === 'PROFILE' ? (
              <View
                style={[
                  styles.bottomIcon,
                  tab === activeTab && [styles.bottomIconActive, { backgroundColor: primary }],
                ]}
              >
                <Text
                  style={[
                    styles.bottomIconText,
                    tab === activeTab && styles.bottomIconTextActive,
                  ]}
                >
                  JS
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.bottomNavText,
                  tab === activeTab && [styles.bottomNavTextActive, { color: primary }],
                ]}
              >
                {tab}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: '#f3f6f4',
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f3f6f4',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#dde6df',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#17211c',
    shadowOffset: {
      width: 0,
      height: 18,
    },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 4,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 30,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: '#1f7a53',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  eyebrow: {
    color: '#1f7a53',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#17211c',
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 30,
  },
  form: {
    gap: 10,
  },
  label: {
    color: '#34413b',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#f8faf8',
    borderColor: '#ccd8d0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211c',
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: '#dc2626',
    borderWidth: 2,
  },
  fieldErrorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -4,
  },
  dateInput: {
    justifyContent: 'center',
  },
  dateInputText: {
    color: '#17211c',
    fontSize: 16,
  },
  dateInputPlaceholder: {
    color: '#82918a',
  },
  calendarOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 33, 28, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  calendarPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    width: '100%',
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarNavButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  calendarNavText: {
    color: '#1f7a53',
    fontSize: 18,
    fontWeight: '900',
  },
  calendarTitle: {
    color: '#17211c',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  calendarWeekdays: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekday: {
    color: '#6b7a72',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: '14.2857%',
  },
  calendarDaySelected: {
    backgroundColor: '#1f7a53',
    borderRadius: 999,
  },
  calendarDayDisabled: {
    opacity: 0.35,
  },
  calendarDayText: {
    color: '#17211c',
    fontSize: 14,
    fontWeight: '700',
  },
  calendarDayMuted: {
    color: '#b3beb8',
  },
  calendarDayTextSelected: {
    color: '#ffffff',
  },
  calendarCloseButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 44,
  },
  loginScroller: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loginModeToggle: {
    backgroundColor: '#f0f2f1',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
    padding: 4,
  },
  loginModeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  loginModeButtonActive: {
    backgroundColor: '#ffffff',
  },
  loginModeText: {
    color: '#52605a',
    fontSize: 14,
    fontWeight: '800',
  },
  loginModeTextActive: {
    color: '#1f7a53',
  },
  authFeedback: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  authFeedbackText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '700',
  },
  passwordField: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  passwordEyeButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 6,
    justifyContent: 'center',
    marginLeft: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  passwordEyeText: {
    color: '#1f7a53',
    fontSize: 13,
    fontWeight: '800',
  },
  lockedValue: {
    backgroundColor: '#f8faf8',
    borderColor: '#ccd8d0',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  lockedValueText: {
    color: '#17211c',
    fontSize: 15,
  },
  helperText: {
    color: '#5b6b62',
    fontSize: 12,
    marginTop: -4,
  },
  passwordChecklist: {
    gap: 4,
    marginBottom: 4,
  },
  passwordCheckItem: {
    color: '#82918a',
    fontSize: 13,
    fontWeight: '700',
  },
  passwordCheckItemMet: {
    color: '#1f7a53',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 48,
  },
  secondaryButtonText: {
    color: '#1f7a53',
    fontSize: 15,
    fontWeight: '800',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 12,
    marginTop: 2,
  },
  forgotText: {
    color: '#1f7a53',
    fontSize: 14,
    fontWeight: '700',
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#1f7a53',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 52,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  homeContent: {
    flex: 1,
    padding: 22,
  },
  screenScroller: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dde6df',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginTop: 24,
    padding: 16,
  },
  registrationScreen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  registrationMenu: {
    padding: 24,
    paddingBottom: 92,
  },
  registrationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18,
  },
  registrationCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d9e3dd',
    borderRadius: 8,
    borderTopWidth: 5,
    borderWidth: 1,
    gap: 8,
    minHeight: 150,
    padding: 14,
    shadowColor: '#17211c',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    width: '48%',
    elevation: 2,
  },
  registrationBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  registrationBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  registrationGroup: {
    color: '#6b7a72',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  registrationCardText: {
    color: '#17211c',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 23,
  },
  registrationStatus: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f2f1',
    borderRadius: 999,
    color: '#6b7a72',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 'auto',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  registrationStatusReady: {
    backgroundColor: '#e8f4ed',
    color: '#1f7a53',
  },
  placeholderView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#1f7a53',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomNav: {
    backgroundColor: '#ffffff',
    borderTopColor: '#dde6df',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  bottomNavButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  bottomNavButtonActive: {
    backgroundColor: '#e8f4ed',
  },
  bottomNavText: {
    color: '#52605a',
    fontSize: 12,
    fontWeight: '800',
  },
  bottomNavTextActive: {
    color: '#1f7a53',
  },
  bottomIcon: {
    alignItems: 'center',
    backgroundColor: '#edf2ef',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  bottomIconActive: {
    backgroundColor: '#1f7a53',
  },
  bottomIconText: {
    color: '#52605a',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomIconTextActive: {
    color: '#ffffff',
  },
  sectionLabel: {
    color: '#1f7a53',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  selectedTitle: {
    color: '#17211c',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 12,
  },
  selectedText: {
    color: '#52605a',
    fontSize: 16,
    lineHeight: 24,
  },
  productView: {
    paddingBottom: 24,
    width: '100%',
  },
  productScroller: {
    flex: 1,
    width: '100%',
  },
  formTitle: {
    color: '#17211c',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
    marginBottom: 12,
  },
  formDescription: {
    color: '#52605a',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 20,
  },
  productForm: {
    backgroundColor: '#ffffff',
    borderColor: '#dde6df',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 20,
    padding: 16,
  },
  formHint: {
    backgroundColor: '#f8faf8',
    borderColor: '#dde6df',
    borderRadius: 8,
    borderWidth: 1,
    color: '#52605a',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    padding: 12,
  },
  formFeedback: {
    backgroundColor: '#e8f4ed',
    borderColor: '#c8e4d4',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1f7a53',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    padding: 12,
  },
  selectLike: {
    backgroundColor: '#f8faf8',
    borderColor: '#ccd8d0',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  selectLikeText: {
    color: '#17211c',
    fontSize: 16,
  },
  optionList: {
    gap: 8,
  },
  inlineFields: {
    flexDirection: 'row',
    gap: 10,
  },
  dddInput: {
    width: 82,
  },
  flexInput: {
    flex: 1,
  },
  optionButton: {
    backgroundColor: '#f8faf8',
    borderColor: '#ccd8d0',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  optionButtonActive: {
    backgroundColor: '#e8f4ed',
    borderColor: '#1f7a53',
  },
  optionButtonText: {
    color: '#34413b',
    fontSize: 15,
    fontWeight: '800',
  },
  optionButtonTextActive: {
    color: '#1f7a53',
  },
  statusToggle: {
    backgroundColor: '#f0f2f1',
    borderColor: '#ccd8d0',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    padding: 4,
    width: 128,
  },
  statusToggleThumb: {
    alignItems: 'center',
    backgroundColor: '#7a8981',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 74,
  },
  statusToggleThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: '#1f7a53',
  },
  statusToggleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  formActions: {
    gap: 10,
    marginTop: 8,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  clearButtonText: {
    color: '#1f7a53',
    fontSize: 15,
    fontWeight: '800',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#1f7a53',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  fileActionGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  fileButton: {
    alignItems: 'center',
    backgroundColor: '#17211c',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  fileButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  cameraButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cameraButtonText: {
    color: '#1f7a53',
    fontSize: 15,
    fontWeight: '800',
  },
  cameraScreen: {
    backgroundColor: '#050806',
    flex: 1,
  },
  cameraPreview: {
    flex: 1,
  },
  cameraControls: {
    alignItems: 'center',
    backgroundColor: '#050806',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  cameraControlButton: {
    alignItems: 'center',
    backgroundColor: '#243028',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cameraControlText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  cameraCaptureButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  cameraCaptureText: {
    color: '#17211c',
    fontSize: 13,
    fontWeight: '900',
  },
  studentFileList: {
    gap: 10,
    marginTop: 4,
  },
  studentFileCard: {
    backgroundColor: '#f8faf8',
    borderColor: '#dde6df',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    overflow: 'hidden',
    padding: 12,
  },
  studentFilePreview: {
    borderRadius: 6,
    height: 160,
    marginBottom: 4,
    width: '100%',
  },
  studentFileName: {
    color: '#17211c',
    fontSize: 14,
    fontWeight: '800',
  },
  studentFilePath: {
    color: '#6b7a72',
    fontSize: 12,
    lineHeight: 17,
  },
  studentFileActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  fileSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#e8f4ed',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  fileSecondaryButtonText: {
    color: '#1f7a53',
    fontSize: 13,
    fontWeight: '800',
  },
  fileDangerButton: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
  },
  fileDangerButtonText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '800',
  },
  productGridSection: {
    marginTop: 24,
  },
  gridTitle: {
    color: '#17211c',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderColor: '#ccd8d0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211c',
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  newButton: {
    alignItems: 'center',
    backgroundColor: '#17211c',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 46,
  },
  newButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  productList: {
    gap: 10,
    marginTop: 12,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dde6df',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  productCardSelected: {
    backgroundColor: '#f0f8f3',
    borderColor: '#1f7a53',
  },
  productCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  productName: {
    color: '#17211c',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  productStatus: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  productStatusActive: {
    backgroundColor: '#e8f4ed',
    color: '#1f7a53',
  },
  productStatusInactive: {
    backgroundColor: '#f0f2f1',
    color: '#6b7a72',
  },
  productStock: {
    color: '#52605a',
    fontSize: 14,
    marginTop: 8,
  },
  emptyText: {
    color: '#6b7a72',
    fontSize: 14,
    paddingVertical: 10,
  },
  disabledControl: {
    opacity: 0.55,
  },
});
