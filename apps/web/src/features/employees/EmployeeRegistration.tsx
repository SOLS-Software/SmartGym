'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, formatCpf, formatDateInput, getLookupLabel, isImageFile, isValidCpf, onlyDigits, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import type { Company, CompanyChildRecord, CompanyChildTable, Employee, LookupRecord, Role } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
type EmployeeValidationField =
  | 'name'
  | 'cpf'
  | 'birthDate'
  | 'admissionDate'
  | 'ddd'
  | 'phone'
  | 'email';
type EmployeeValidationErrors = Partial<Record<EmployeeValidationField, string>>;

const employeeRelatedTables: CompanyChildTable[] = [
  {
    key: 'files',
    endpoint: 'files',
    label: 'Arquivos',
    title: 'Arquivos do funcionario',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'idTiposArquivos', label: 'Tipo', lookupLabelKey: 'dsTipo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
    fields: [
      { key: 'idTiposArquivos', label: 'Tipo de arquivo', type: 'number', lookupEndpoint: 'file-types', lookupLabelKey: 'dsTipo' },
      { key: 'dsArquivo', label: 'Arquivo', type: 'text', required: true },
      { key: 'anCaminho', label: 'Caminho', type: 'text' },
      { key: 'cnChaveAcesso', label: 'Chave acesso', type: 'number' },
      { key: 'cnDistribuidor', label: 'Distribuidor', type: 'number' },
    ],
  },
];

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 9);

  if (digits.length <= 8) {
    return digits.replace(/^(\d{4})(\d)/, '$1-$2');
  }

  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearValue, monthValue, dayValue] = value.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidPastDate(value: string) {
  if (!isValidDateInput(value)) {
    return false;
  }

  const [yearValue, monthValue, dayValue] = value.split('-');
  const date = new Date(Number(yearValue), Number(monthValue) - 1, Number(dayValue));

  return date <= new Date(new Date().setHours(0, 0, 0, 0));
}

export function EmployeeRegistration() {
  const employeeFileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const employeeRelatedFormRef = useRef<HTMLDivElement | null>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const birthDateInputRef = useRef<HTMLInputElement>(null);
  const admissionDateInputRef = useRef<HTMLInputElement>(null);
  const dddInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesPage, setEmployeesPage] = useState(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeCpf, setEmployeeCpf] = useState('');
  const [employeeBirthDate, setEmployeeBirthDate] = useState('');
  const [employeeDdd, setEmployeeDdd] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeAdmissionDate, setEmployeeAdmissionDate] = useState('');
  const [isEmployeeActive, setIsEmployeeActive] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [isEmployeeFieldsCollapsed, setIsEmployeeFieldsCollapsed] = useState(false);
  const [employeeErrors, setEmployeeErrors] = useState<EmployeeValidationErrors>({});
  const [touchedEmployeeFields, setTouchedEmployeeFields] = useState<
    Partial<Record<EmployeeValidationField, boolean>>
  >({});
  const [selectedEmployeeRelatedTable, setSelectedEmployeeRelatedTable] = useState('');
  const [employeeRelatedRecords, setEmployeeRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingEmployeeRelatedRecords, setIsLoadingEmployeeRelatedRecords] = useState(false);
  const [employeeRelatedSearchTerm, setEmployeeRelatedSearchTerm] = useState('');
  const [selectedEmployeeRelatedRecordId, setSelectedEmployeeRelatedRecordId] = useState<number | null>(null);
  const [isCreatingEmployeeRelated, setIsCreatingEmployeeRelated] = useState(false);
  const [employeeRelatedFormValues, setEmployeeRelatedFormValues] = useState<Record<string, string>>({});
  const [isEmployeeRelatedActive, setIsEmployeeRelatedActive] = useState(true);
  const [employeeRelatedFeedback, setEmployeeRelatedFeedback] = useState('');
  const [employeeRelatedLookups, setEmployeeRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [employeeFilePreviewUrls, setEmployeeFilePreviewUrls] = useState<Record<number, string>>({});
  const [employeeFileModal, setEmployeeFileModal] = useState<{ title: string; url: string } | null>(null);
  const [isUploadingEmployeeFile, setIsUploadingEmployeeFile] = useState(false);
  const [isEmployeeRelatedFieldsCollapsed, setIsEmployeeRelatedFieldsCollapsed] = useState(false);
  const isFormEnabled = selectedEmployeeId !== null || isCreating;
  const employeeRelatedConfig =
    employeeRelatedTables.find((table) => table.key === selectedEmployeeRelatedTable) ?? null;
  const isEmployeeRelatedFormEnabled =
    Boolean(selectedEmployeeId) && (selectedEmployeeRelatedRecordId !== null || isCreatingEmployeeRelated);
  const filteredEmployeeRelatedRecords = employeeRelatedRecords.filter((record) =>
    employeeRelatedConfig
      ? employeeRelatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column, employeeRelatedLookups[column.key]).includes(employeeRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredEmployees = employees.filter((employee) => {
    if (selectedEmployeeRelatedTable && selectedEmployeeId !== null) {
      return employee.id === selectedEmployeeId;
    }

    const search = searchTerm.toLowerCase();
    const role = roles.find((item) => item.id === employee.idCargo);
    const company = companies.find((item) => item.id === employee.idEmpresa);

    return (
      employee.nmFuncionario.toLowerCase().includes(search) ||
      employee.caCPF.includes(searchTerm.replace(/\D/g, '')) ||
      employee.anEmail.toLowerCase().includes(search) ||
      String(role?.dsCargo ?? '').toLowerCase().includes(search) ||
      String(company?.dsEmpresa ?? '').toLowerCase().includes(search) ||
      (employee.boInativo === 0 ? 'ativo' : 'inativo').includes(search)
    );
  });
  const employeesTotalPages = Math.max(1, Math.ceil(filteredEmployees.length / GRID_PAGE_SIZE));
  const paginatedEmployees = paginateItems(filteredEmployees, employeesPage);

  async function loadEmployees() {
    try {
      setIsLoadingEmployees(true);
      const response = await fetch(`${apiUrl}/employees`);

      if (!response.ok) {
        await getApiError(response, 'Não foi possível carregar os funcionários.');
      }

      setEmployees((await response.json()) as Employee[]);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar funcionários.');
    } finally {
      setIsLoadingEmployees(false);
    }
  }

  async function loadLookups() {
    try {
      const [companiesResponse, rolesResponse] = await Promise.all([
        fetch(`${apiUrl}/companies`),
        fetch(`${apiUrl}/roles`),
      ]);

      const failedLookup = [companiesResponse, rolesResponse].find((r) => !r.ok);
      if (failedLookup) {
        await getApiError(failedLookup, 'Não foi possível carregar empresas e cargos.');
      }

      const companiesData = (await companiesResponse.json()) as Company[];
      const rolesData = (await rolesResponse.json()) as Role[];
      setCompanies(companiesData.filter((company) => company.boInativo === 0));
      setRoles(rolesData.filter((role) => role.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  async function loadEmployeeRelatedRecords(
    employeeId = selectedEmployeeId,
    config = employeeRelatedConfig,
  ) {
    if (!config || !employeeId) {
      setEmployeeRelatedRecords([]);
      setIsLoadingEmployeeRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingEmployeeRelatedRecords(true);
      const response = await fetch(`${apiUrl}/employees/${employeeId}/related/${config.endpoint}`);

      if (!response.ok) {
        await getApiError(response, 'Nao foi possivel carregar os registros relacionados.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setEmployeeRelatedRecords(data);
      if (config.key === 'files') {
        const imageFiles = data.filter((file) => isImageFile(String(file.anCaminho ?? '')));
        const urlEntries = await Promise.all(
          imageFiles.map(async (file) => {
            try {
              const urlResponse = await fetch(`${apiUrl}/employees/${employeeId}/related/files/${file.id}/url`);
              if (!urlResponse.ok) return null;
              const urlData = (await urlResponse.json()) as { url: string };
              return [file.id, urlData.url] as const;
            } catch {
              return null;
            }
          }),
        );
        setEmployeeFilePreviewUrls(Object.fromEntries(urlEntries.filter((entry): entry is [number, string] => Boolean(entry))));
      } else {
        setEmployeeFilePreviewUrls({});
      }
      setEmployeeRelatedFeedback('');
    } catch (error) {
      setEmployeeRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.',
      );
      setEmployeeRelatedRecords([]);
      setEmployeeFilePreviewUrls({});
    } finally {
      setIsLoadingEmployeeRelatedRecords(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
    void loadLookups();
  }, []);

  useEffect(() => {
    setEmployeesPage(1);
  }, [searchTerm, selectedEmployeeId]);

  useEffect(() => {
    if (employeesPage > employeesTotalPages) {
      setEmployeesPage(employeesTotalPages);
    }
  }, [employeesPage, employeesTotalPages]);

  useEffect(() => {
    setSelectedEmployeeRelatedRecordId(null);
    setIsCreatingEmployeeRelated(false);
    setEmployeeRelatedFormValues({});
    setIsEmployeeRelatedActive(true);
    setEmployeeRelatedSearchTerm('');
    setEmployeeRelatedFeedback('');
    void loadEmployeeRelatedRecords();
  }, [selectedEmployeeId, selectedEmployeeRelatedTable]);

  useEffect(() => {
    async function loadEmployeeRelatedLookups() {
      if (!employeeRelatedConfig) {
        return;
      }

      const lookupFields = employeeRelatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

          const response = await fetch(`${apiUrl}/${field.lookupEndpoint}`);

          if (!response.ok) {
            await getApiError(response, `Nao foi possivel carregar ${field.label}.`);
          }

          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setEmployeeRelatedLookups((current) => ({
        ...current,
        ...nextLookups,
      }));
    }

    void loadEmployeeRelatedLookups().catch((error) => {
      setEmployeeRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.',
      );
    });
  }, [employeeRelatedConfig]);

  function clearForm() {
    setSelectedEmployeeId(null);
    setIsCreating(false);
    setSelectedCompanyId('');
    setSelectedRoleId('');
    setEmployeeName('');
    setEmployeeCpf('');
    setEmployeeBirthDate('');
    setEmployeeDdd('');
    setEmployeePhone('');
    setEmployeeEmail('');
    setEmployeeAdmissionDate('');
    setIsEmployeeActive(true);
    setEmployeeErrors({});
    setTouchedEmployeeFields({});
    setFeedback('');
    setEmployeeRelatedRecords([]);
    setSelectedEmployeeRelatedRecordId(null);
    setIsCreatingEmployeeRelated(false);
    setEmployeeRelatedFormValues({});
    setEmployeeRelatedFeedback('');
  }

  function handleNewEmployee() {
    clearForm();
    setIsCreating(true);
    setIsEmployeeActive(true);
    setEmployeeAdmissionDate(new Date().toISOString().slice(0, 10));
    setIsEmployeeFieldsCollapsed(false);
    setIsEmployeeRelatedFieldsCollapsed(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function handleSelectEmployee(employee: Employee) {
    if (employee.id === selectedEmployeeId) {
      clearForm();
      return;
    }

    setSelectedEmployeeId(employee.id);
    setIsCreating(false);
    setSelectedCompanyId(employee.idEmpresa ? String(employee.idEmpresa) : '');
    setSelectedRoleId(employee.idCargo ? String(employee.idCargo) : '');
    setEmployeeName(employee.nmFuncionario);
    setEmployeeCpf(formatCpf(employee.caCPF));
    setEmployeeBirthDate(formatDateInput(employee.dtNascimento));
    setEmployeeDdd(employee.nrDDD ? String(employee.nrDDD) : '');
    setEmployeePhone(formatPhone(String(employee.nrContato ?? '')));
    setEmployeeEmail(employee.anEmail);
    setEmployeeAdmissionDate(formatDateInput(employee.dtAdmissao));
    setIsEmployeeActive(employee.boInativo === 0);
    setEmployeeErrors({});
    setTouchedEmployeeFields({});
    setFeedback('');
    setEmployeeRelatedFeedback('');
    setIsEmployeeFieldsCollapsed(false);
    setIsEmployeeRelatedFieldsCollapsed(true);
  }

  function handleSelectEmployeeRelatedTable(tableKey: string) {
    setSelectedEmployeeRelatedTable(tableKey);
    setEmployeeRelatedFeedback('');
  }

  function clearEmployeeRelatedForm() {
    setSelectedEmployeeRelatedRecordId(null);
    setIsCreatingEmployeeRelated(false);
    setEmployeeRelatedFormValues({});
    setIsEmployeeRelatedActive(true);
    setEmployeeRelatedFeedback('');
  }

  function handleNewEmployeeRelated() {
    setSelectedEmployeeRelatedRecordId(null);
    setIsCreatingEmployeeRelated(true);
    setEmployeeRelatedFormValues({});
    setIsEmployeeRelatedActive(true);
    setEmployeeRelatedFeedback('');
    setIsEmployeeFieldsCollapsed(true);
    setIsEmployeeRelatedFieldsCollapsed(false);
    setTimeout(() => { employeeRelatedFormRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled])')?.focus(); }, 0);
  }

  function handleSelectEmployeeRelatedRecord(record: CompanyChildRecord) {
    if (!employeeRelatedConfig) {
      return;
    }

    const values = employeeRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      current[field.key] = String(record[field.key] ?? '');
      return current;
    }, {});

    setSelectedEmployeeRelatedRecordId(record.id);
    setIsCreatingEmployeeRelated(false);
    setEmployeeRelatedFormValues(values);
    setIsEmployeeRelatedActive(Number(record.boInativo ?? 0) === 0);
    setEmployeeRelatedFeedback('');
    setIsEmployeeFieldsCollapsed(true);
    setIsEmployeeRelatedFieldsCollapsed(false);
  }

  function getRoleLabel(roleId: number | null) {
    return roles.find((role) => role.id === roleId)?.dsCargo ?? '-';
  }

  function getEmployeeValidationErrors() {
    const errors: EmployeeValidationErrors = {};
    const cpf = onlyDigits(employeeCpf);
    const ddd = onlyDigits(employeeDdd);
    const phone = onlyDigits(employeePhone);
    const trimmedEmail = employeeEmail.trim();

    if (!employeeName.trim()) {
      errors.name = 'Informe o nome do funcionário.';
    }

    if (!isValidCpf(cpf)) {
      errors.cpf = 'Informe um CPF válido.';
    }

    if (employeeBirthDate && !isValidPastDate(employeeBirthDate)) {
      errors.birthDate = 'Informe uma data de nascimento valida.';
    }

    if (employeeAdmissionDate && !isValidDateInput(employeeAdmissionDate)) {
      errors.admissionDate = 'Informe uma data de admissao valida.';
    }

    if (ddd && ddd.length !== 2) {
      errors.ddd = 'Informe o DDD com 2 digitos.';
    }

    if (phone && phone.length !== 8 && phone.length !== 9) {
      errors.phone = 'Informe um contato com 8 ou 9 digitos.';
    }

    if (phone && !ddd) {
      errors.ddd = 'Informe o DDD do contato.';
    }

    if (ddd && !phone) {
      errors.phone = 'Informe o contato.';
    }

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      errors.email = 'Informe um email válido.';
    }

    return errors;
  }

  function validateEmployeeField(field: EmployeeValidationField) {
    const errors = getEmployeeValidationErrors();

    setTouchedEmployeeFields((current) => ({
      ...current,
      [field]: true,
    }));
    setEmployeeErrors((current) => ({
      ...current,
      [field]: errors[field],
      ...(field === 'ddd' ? { phone: errors.phone } : {}),
      ...(field === 'phone' ? { ddd: errors.ddd } : {}),
    }));

    return !errors[field];
  }

  function focusFirstEmployeeError(errors: EmployeeValidationErrors) {
    if (errors.name) {
      nameInputRef.current?.focus();
      return;
    }

    if (errors.cpf) {
      cpfInputRef.current?.focus();
      return;
    }

    if (errors.birthDate) {
      birthDateInputRef.current?.focus();
      return;
    }

    if (errors.admissionDate) {
      admissionDateInputRef.current?.focus();
      return;
    }

    if (errors.ddd) {
      dddInputRef.current?.focus();
      return;
    }

    if (errors.phone) {
      phoneInputRef.current?.focus();
      return;
    }

    if (errors.email) {
      emailInputRef.current?.focus();
    }
  }

  async function handleToggleEmployeeStatus() {
    const nextActive = !isEmployeeActive;
    setIsEmployeeActive(nextActive);

    if (!selectedEmployeeId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/employees/${selectedEmployeeId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boInativo: nextActive ? 0 : 1,
        }),
      });

      if (!response.ok) {
        await getApiError(response, 'Não foi possível alterar o status.');
      }

      const updatedEmployee = (await response.json()) as Employee;
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === updatedEmployee.id ? updatedEmployee : employee,
        ),
      );
    } catch (error) {
      setIsEmployeeActive(!nextActive);
      setFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = getEmployeeValidationErrors();
    const phone = onlyDigits(employeePhone);

    if (Object.keys(errors).length > 0) {
      setEmployeeErrors(errors);
      setTouchedEmployeeFields({
        admissionDate: true,
        birthDate: true,
        cpf: true,
        ddd: true,
        email: true,
        name: true,
        phone: true,
      });
      setFeedback(Object.values(errors)[0] ?? 'Revise os campos destacados.');
      focusFirstEmployeeError(errors);
      return;
    }

    try {
      const payload = {
        idEmpresa: selectedCompanyId ? Number(selectedCompanyId) : null,
        idCargo: selectedRoleId ? Number(selectedRoleId) : null,
        nmFuncionario: employeeName.trim(),
        caCPF: onlyDigits(employeeCpf),
        dtNascimento: employeeBirthDate || null,
        nrDDD: onlyDigits(employeeDdd) || null,
        nrContato: Number(phone || 0),
        anEmail: employeeEmail.trim(),
        dtAdmissao: employeeAdmissionDate || null,
        boInativo: isEmployeeActive ? 0 : 1,
      };
      const response = await fetch(
        isCreating ? `${apiUrl}/employees` : `${apiUrl}/employees/${selectedEmployeeId}`,
        {
          method: isCreating ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o funcionário.');
      }

      const savedEmployee = (await response.json()) as Employee;
      await loadEmployees();
      setSelectedEmployeeId(savedEmployee.id);
      setIsCreating(false);
      setFeedback('Funcionário salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao salvar funcionário.');
    }
  }

  async function handleToggleEmployeeRelatedStatus() {
    if (!employeeRelatedConfig) {
      return;
    }

    const nextActive = !isEmployeeRelatedActive;
    setIsEmployeeRelatedActive(nextActive);

    if (!selectedEmployeeId || !selectedEmployeeRelatedRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/employees/${selectedEmployeeId}/related/${employeeRelatedConfig.endpoint}/${selectedEmployeeRelatedRecordId}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            boInativo: nextActive ? 0 : 1,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel alterar o status.');
      }

      const updatedRecord = (await response.json()) as CompanyChildRecord;
      setEmployeeRelatedRecords((current) =>
        current.map((record) => (record.id === updatedRecord.id ? updatedRecord : record)),
      );
    } catch (error) {
      setIsEmployeeRelatedActive(!nextActive);
      setEmployeeRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveEmployeeRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!employeeRelatedConfig) {
      setEmployeeRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedEmployeeId) {
      setEmployeeRelatedFeedback('Selecione um funcionario antes de salvar.');
      return;
    }

    const missingRequiredField = employeeRelatedConfig.fields.find(
      (field) => field.required && !employeeRelatedFormValues[field.key],
    );

    if (missingRequiredField) {
      setEmployeeRelatedFeedback(`Informe ${missingRequiredField.label}.`);
      return;
    }

    try {
      const payload = employeeRelatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = employeeRelatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        {
          boInativo: isEmployeeRelatedActive ? 0 : 1,
        },
      );

      const response = await fetch(
        selectedEmployeeRelatedRecordId
          ? `${apiUrl}/employees/${selectedEmployeeId}/related/${employeeRelatedConfig.endpoint}/${selectedEmployeeRelatedRecordId}`
          : `${apiUrl}/employees/${selectedEmployeeId}/related/${employeeRelatedConfig.endpoint}`,
        {
          method: selectedEmployeeRelatedRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar o registro relacionado.');
      }

      const savedRecord = (await response.json()) as CompanyChildRecord;
      await loadEmployeeRelatedRecords(selectedEmployeeId, employeeRelatedConfig);
      setSelectedEmployeeRelatedRecordId(savedRecord.id);
      setIsCreatingEmployeeRelated(false);
      setEmployeeRelatedFeedback(`${employeeRelatedConfig.label} salvo com sucesso.`);
    } catch (error) {
      setEmployeeRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.',
      );
    }
  }

  async function handleUploadEmployeeFile(file: File | null) {
    if (!file || !selectedEmployeeId || !employeeRelatedConfig) {
      return;
    }

    try {
      setIsUploadingEmployeeFile(true);
      setEmployeeRelatedFeedback('');
      const formData = new FormData();
      formData.append('idTiposArquivos', employeeRelatedFormValues.idTiposArquivos ?? '');
      formData.append('file', file);
      const isReplacingFile = selectedEmployeeRelatedRecordId !== null && !isCreatingEmployeeRelated;
      const response = await fetch(
        isReplacingFile
          ? `${apiUrl}/employees/${selectedEmployeeId}/related/files/${selectedEmployeeRelatedRecordId}`
          : `${apiUrl}/employees/${selectedEmployeeId}/related/files`,
        {
          method: isReplacingFile ? 'PUT' : 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o arquivo.');
      }

      const saved = (await response.json()) as CompanyChildRecord;
      await loadEmployeeRelatedRecords(selectedEmployeeId, employeeRelatedConfig);
      setSelectedEmployeeRelatedRecordId(saved.id);
      setIsCreatingEmployeeRelated(false);
      setEmployeeRelatedFormValues({
        idTiposArquivos: saved.idTiposArquivos ? String(saved.idTiposArquivos) : '',
      });
      setEmployeeRelatedFeedback(isReplacingFile ? 'Arquivo alterado com sucesso.' : 'Arquivo enviado com sucesso.');
    } catch (error) {
      setEmployeeRelatedFeedback(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploadingEmployeeFile(false);
      if (employeeFileInputRef.current) {
        employeeFileInputRef.current.value = '';
      }
    }
  }

  async function handleOpenEmployeeFile(fileId: number) {
    if (!selectedEmployeeId) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/employees/${selectedEmployeeId}/related/files/${fileId}/url`);
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
      }
      const data = (await response.json()) as { url: string };
      const file = employeeRelatedRecords.find((record) => record.id === fileId);
      setEmployeeFileModal({ title: String(file?.dsArquivo ?? `Arquivo ${fileId}`), url: data.url });
    } catch (error) {
      setEmployeeRelatedFeedback(error instanceof Error ? error.message : 'Erro ao abrir arquivo.');
    }
  }

  async function handleRemoveEmployeeFile(fileId: number) {
    if (!selectedEmployeeId || !employeeRelatedConfig) {
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/employees/${selectedEmployeeId}/related/files/${fileId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }
      await loadEmployeeRelatedRecords(selectedEmployeeId, employeeRelatedConfig);
      setSelectedEmployeeRelatedRecordId(null);
      setEmployeeRelatedFeedback('Arquivo removido com sucesso.');
    } catch (error) {
      setEmployeeRelatedFeedback(error instanceof Error ? error.message : 'Erro ao remover arquivo.');
    }
  }

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Profissionais</p>
      </div>

      <div className="registration-split-layout plan-split-layout">
        <section className="data-grid-section company-grid-section">
          <RegistrationGrid<Employee>
            ariaLabel="Funcionários cadastrados"
            label="Funcionários"
            columns={[
              { label: 'Funcionário', render: (e) => e.nmFuncionario },
              { label: 'Cargo', render: (e) => getRoleLabel(e.idCargo) },
              { label: 'Status', render: (e) => <span className={`status-badge ${e.boInativo === 0 ? 'active' : 'inactive'}`}>{e.boInativo === 0 ? 'Ativo' : 'Inativo'}</span> },
            ]}
            records={paginatedEmployees}
            isLoading={isLoadingEmployees}
            selectedId={selectedEmployeeId}
            onSelect={handleSelectEmployee}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar funcionário"
            onNew={handleNewEmployee}
            page={employeesPage}
            totalItems={filteredEmployees.length}
            onPageChange={setEmployeesPage}
          />

          {employeeRelatedConfig ? (
            <section className="company-child-grid-section">
              {!selectedEmployeeId ? (
                <div className="form-hint">
                  Selecione um funcionario para visualizar os registros relacionados.
                </div>
              ) : (
                <RegistrationGrid<CompanyChildRecord>
                  ariaLabel={employeeRelatedConfig.title}
                  label={employeeRelatedConfig.label}
                  columns={employeeRelatedConfig.columns.map((column) => ({
                    label: column.label,
                    render: (record) => formatChildCell(record, column, employeeRelatedLookups[column.key]),
                  }))}
                  records={filteredEmployeeRelatedRecords}
                  isLoading={isLoadingEmployeeRelatedRecords}
                  selectedId={selectedEmployeeRelatedRecordId}
                  onSelect={handleSelectEmployeeRelatedRecord}
                  searchTerm={employeeRelatedSearchTerm}
                  onSearch={setEmployeeRelatedSearchTerm}
                  onNew={handleNewEmployeeRelated}
                  newDisabled={!selectedEmployeeId}
                  variant="child"
                />
              )}
            </section>
          ) : null}
        </section>

        <div className="split-form-stack">
        <form
          className={`registration-form split-form-panel company-form-panel ${isEmployeeFieldsCollapsed ? 'collapsed' : ''}`}
          onSubmit={handleSaveEmployee}
        >
          <div className="collapsible-panel-header">
            <div>
              <p className="section-label">Cadastro de Funcionário</p>
            </div>
            <button
              aria-expanded={!isEmployeeFieldsCollapsed}
              className="secondary-button"
              onClick={() => setIsEmployeeFieldsCollapsed((current) => !current)}
              type="button"
            >
              {isEmployeeFieldsCollapsed ? '+' : '-'}
            </button>
          </div>

          {!isEmployeeFieldsCollapsed ? (
            <>
              {!isFormEnabled ? (
                <div className="form-hint">
                  Selecione um funcionário acima para editar ou clique em Novo.
                </div>
              ) : null}

              {feedback ? <div className="form-feedback">{feedback}</div> : null}

              <div className="company-child-fields">
                <div className="field">
                  <label htmlFor="employeeName">Nome do funcionário *</label>
                  <input
                    className={touchedEmployeeFields.name && employeeErrors.name ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="employeeName"
                    maxLength={255}
                    onBlur={() => validateEmployeeField('name')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEmployeeName(value);

                      if (touchedEmployeeFields.name) {
                        setEmployeeErrors((current) => ({
                          ...current,
                          name: value.trim() ? undefined : 'Informe o nome do funcionário.',
                        }));
                      }
                    }}
                    placeholder="Ex.: Joao Souza"
                    ref={nameInputRef}
                    type="text"
                    value={employeeName}
                  />
                  {touchedEmployeeFields.name && employeeErrors.name ? (
                    <span className="field-error">{employeeErrors.name}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeeCpf">CPF *</label>
                  <input
                    className={touchedEmployeeFields.cpf && employeeErrors.cpf ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="employeeCpf"
                    maxLength={14}
                    onBlur={() => validateEmployeeField('cpf')}
                    onChange={(event) => {
                      const formattedCpf = formatCpf(event.target.value);
                      setEmployeeCpf(formattedCpf);

                      if (touchedEmployeeFields.cpf) {
                        setEmployeeErrors((current) => ({
                          ...current,
                          cpf: isValidCpf(formattedCpf) ? undefined : 'Informe um CPF válido.',
                        }));
                      }
                    }}
                    placeholder="000.000.000-00"
                    ref={cpfInputRef}
                    type="text"
                    value={employeeCpf}
                  />
                  {touchedEmployeeFields.cpf && employeeErrors.cpf ? (
                    <span className="field-error">{employeeErrors.cpf}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeeCompany">Empresa</label>
                  <select
                    disabled={!isFormEnabled}
                    id="employeeCompany"
                    onChange={(event) => setSelectedCompanyId(event.target.value)}
                    value={selectedCompanyId}
                  >
                    <option value="">Selecione</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.dsEmpresa}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="employeeRole">Cargo</label>
                  <select
                    disabled={!isFormEnabled}
                    id="employeeRole"
                    onChange={(event) => setSelectedRoleId(event.target.value)}
                    value={selectedRoleId}
                  >
                    <option value="">Selecione</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.dsCargo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="employeeBirthDate">Nascimento</label>
                  <input
                    className={
                      touchedEmployeeFields.birthDate && employeeErrors.birthDate
                        ? 'invalid'
                        : ''
                    }
                    disabled={!isFormEnabled}
                    id="employeeBirthDate"
                    max={new Date().toISOString().slice(0, 10)}
                    onBlur={() => validateEmployeeField('birthDate')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEmployeeBirthDate(value);

                      if (touchedEmployeeFields.birthDate) {
                        setEmployeeErrors((current) => ({
                          ...current,
                          birthDate:
                            !value || isValidPastDate(value)
                              ? undefined
                              : 'Informe uma data de nascimento valida.',
                        }));
                      }
                    }}
                    ref={birthDateInputRef}
                    type="date"
                    value={employeeBirthDate}
                  />
                  {touchedEmployeeFields.birthDate && employeeErrors.birthDate ? (
                    <span className="field-error">{employeeErrors.birthDate}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeeAdmissionDate">Admissao</label>
                  <input
                    className={
                      touchedEmployeeFields.admissionDate && employeeErrors.admissionDate
                        ? 'invalid'
                        : ''
                    }
                    disabled={!isFormEnabled}
                    id="employeeAdmissionDate"
                    onBlur={() => validateEmployeeField('admissionDate')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEmployeeAdmissionDate(value);

                      if (touchedEmployeeFields.admissionDate) {
                        setEmployeeErrors((current) => ({
                          ...current,
                          admissionDate:
                            !value || isValidDateInput(value)
                              ? undefined
                              : 'Informe uma data de admissao valida.',
                        }));
                      }
                    }}
                    ref={admissionDateInputRef}
                    type="date"
                    value={employeeAdmissionDate}
                  />
                  {touchedEmployeeFields.admissionDate && employeeErrors.admissionDate ? (
                    <span className="field-error">{employeeErrors.admissionDate}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeeDdd">DDD</label>
                  <input
                    className={touchedEmployeeFields.ddd && employeeErrors.ddd ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="employeeDdd"
                    maxLength={2}
                    onBlur={() => validateEmployeeField('ddd')}
                    onChange={(event) => {
                      const value = onlyDigits(event.target.value).slice(0, 2);
                      setEmployeeDdd(value);

                      if (touchedEmployeeFields.ddd || touchedEmployeeFields.phone) {
                        const phone = onlyDigits(employeePhone);
                        setEmployeeErrors((current) => ({
                          ...current,
                          ddd:
                            phone && !value
                              ? 'Informe o DDD do contato.'
                              : value && value.length !== 2
                                ? 'Informe o DDD com 2 digitos.'
                                : undefined,
                          phone:
                            value && !phone
                              ? 'Informe o contato.'
                              : current.phone,
                        }));
                      }
                    }}
                    placeholder="11"
                    ref={dddInputRef}
                    type="text"
                    value={employeeDdd}
                  />
                  {touchedEmployeeFields.ddd && employeeErrors.ddd ? (
                    <span className="field-error">{employeeErrors.ddd}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeePhone">Contato</label>
                  <input
                    className={touchedEmployeeFields.phone && employeeErrors.phone ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="employeePhone"
                    maxLength={10}
                    onBlur={() => validateEmployeeField('phone')}
                    onChange={(event) => {
                      const formattedPhone = formatPhone(event.target.value);
                      const phone = onlyDigits(formattedPhone);
                      setEmployeePhone(formattedPhone);

                      if (touchedEmployeeFields.phone || touchedEmployeeFields.ddd) {
                        setEmployeeErrors((current) => ({
                          ...current,
                          ddd:
                            phone && !employeeDdd
                              ? 'Informe o DDD do contato.'
                              : current.ddd,
                          phone:
                            phone && phone.length !== 8 && phone.length !== 9
                              ? 'Informe um contato com 8 ou 9 digitos.'
                              : employeeDdd && !phone
                                ? 'Informe o contato.'
                                : undefined,
                        }));
                      }
                    }}
                    placeholder="00000-0000"
                    ref={phoneInputRef}
                    type="text"
                    value={employeePhone}
                  />
                  {touchedEmployeeFields.phone && employeeErrors.phone ? (
                    <span className="field-error">{employeeErrors.phone}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeeEmail">Email</label>
                  <input
                    className={touchedEmployeeFields.email && employeeErrors.email ? 'invalid' : ''}
                    disabled={!isFormEnabled}
                    id="employeeEmail"
                    maxLength={100}
                    onBlur={() => validateEmployeeField('email')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEmployeeEmail(value);

                      if (touchedEmployeeFields.email) {
                        const trimmedEmail = value.trim();
                        setEmployeeErrors((current) => ({
                          ...current,
                          email:
                            trimmedEmail && !isValidEmail(trimmedEmail)
                              ? 'Informe um email válido.'
                              : undefined,
                        }));
                      }
                    }}
                    placeholder="profissional@email.com"
                    ref={emailInputRef}
                    type="email"
                    value={employeeEmail}
                  />
                  {touchedEmployeeFields.email && employeeErrors.email ? (
                    <span className="field-error">{employeeErrors.email}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="employeeStatus">Status</label>
                  <button
                    aria-pressed={isEmployeeActive}
                    className={`status-toggle ${isEmployeeActive ? 'active' : ''}`}
                    disabled={!isFormEnabled}
                    id="employeeStatus"
                    onClick={handleToggleEmployeeStatus}
                    type="button"
                  >
                    <span>{isEmployeeActive ? 'Ativo' : 'Inativo'}</span>
                  </button>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="secondary-button"
                  disabled={!isFormEnabled}
                  onClick={clearForm}
                  type="button"
                >
                  Limpar
                </button>
                <button disabled={!isFormEnabled} type="submit">
                  <Save size={16} />
                  Salvar funcionário
                </button>
              </div>
            </>
          ) : null}
        </form>

          {employeeRelatedConfig ? (
            <form
              className={`registration-form split-form-panel company-child-form-panel ${isEmployeeRelatedFieldsCollapsed ? 'collapsed' : ''}`}
              onSubmit={handleSaveEmployeeRelated}
            >
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">{employeeRelatedConfig.label}</p>
                </div>
                <button
                  aria-expanded={!isEmployeeRelatedFieldsCollapsed}
                  className="secondary-button"
                  onClick={() => setIsEmployeeRelatedFieldsCollapsed((current) => !current)}
                  type="button"
                >
                  {isEmployeeRelatedFieldsCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isEmployeeRelatedFieldsCollapsed ? (
                <>
                  {employeeRelatedFeedback ? (
                    <div className="form-feedback">{employeeRelatedFeedback}</div>
                  ) : null}

                  {employeeRelatedConfig.key === 'files' ? (
                    <>
                      <div className="company-child-fields">
                        <div className="field">
                          <label htmlFor="employeeFileType">Tipo de arquivo</label>
                          <select
                            disabled={!selectedEmployeeId || isUploadingEmployeeFile}
                            id="employeeFileType"
                            onChange={(event) =>
                              setEmployeeRelatedFormValues((current) => ({
                                ...current,
                                idTiposArquivos: event.target.value,
                              }))
                            }
                            value={employeeRelatedFormValues.idTiposArquivos ?? ''}
                          >
                            <option value="">Selecione</option>
                            {(employeeRelatedLookups.idTiposArquivos ?? []).map((option) => (
                              <option key={option.id} value={option.id}>
                                {getLookupLabel(option, employeeRelatedConfig.fields.find((field) => field.key === 'idTiposArquivos') ?? employeeRelatedConfig.fields[0]!)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label htmlFor="employeeFileName">Arquivo selecionado</label>
                          <input
                            disabled
                            id="employeeFileName"
                            type="text"
                            value={
                              selectedEmployeeRelatedRecordId
                                ? String(employeeRelatedRecords.find((record) => record.id === selectedEmployeeRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedEmployeeRelatedRecordId}`)
                                : 'Selecione no grid ou clique em Novo'
                            }
                          />
                        </div>
                      </div>

                      <div className="field">
                        <label htmlFor="employeeFile">
                          {selectedEmployeeRelatedRecordId && !isCreatingEmployeeRelated ? 'Alterar arquivo' : 'Arquivo'}
                        </label>
                        <input
                          disabled={!selectedEmployeeId || isUploadingEmployeeFile}
                          id="employeeFile"
                          onChange={(event) => void handleUploadEmployeeFile(event.target.files?.[0] ?? null)}
                          ref={employeeFileInputRef}
                          type="file"
                        />
                      </div>

                      {selectedEmployeeRelatedRecordId ? (
                        <div className="student-files-list">
                          <div className="student-file-row">
                            {employeeFilePreviewUrls[selectedEmployeeRelatedRecordId] ? (
                              <button className="file-preview-button" onClick={() => void handleOpenEmployeeFile(selectedEmployeeRelatedRecordId)} type="button">
                                <img
                                  alt={String(employeeRelatedRecords.find((record) => record.id === selectedEmployeeRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedEmployeeRelatedRecordId}`)}
                                  className="student-file-preview"
                                  src={employeeFilePreviewUrls[selectedEmployeeRelatedRecordId]}
                                />
                              </button>
                            ) : null}
                            <div className="student-file-row-info">
                              <strong>{String(employeeRelatedRecords.find((record) => record.id === selectedEmployeeRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedEmployeeRelatedRecordId}`)}</strong>
                            </div>
                            <div className="student-file-actions">
                              <button className="secondary-button" onClick={() => void handleOpenEmployeeFile(selectedEmployeeRelatedRecordId)} type="button">
                                Visualizar
                              </button>
                              <button className="secondary-button" onClick={() => employeeFileInputRef.current?.click()} type="button">
                                Alterar
                              </button>
                              <button className="danger" onClick={() => void handleRemoveEmployeeFile(selectedEmployeeRelatedRecordId)} type="button">
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : selectedEmployeeId ? (
                        <div className="form-hint">Selecione um arquivo no grid para visualizar ou alterar.</div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {!isEmployeeRelatedFormEnabled ? (
                        <div className="form-hint">
                          Selecione um registro relacionado acima ou clique em Novo.
                        </div>
                      ) : null}

                      <div className="company-child-fields" ref={employeeRelatedFormRef}>
                        {employeeRelatedConfig.fields.map((field) => (
                          <div className="field" key={field.key}>
                            <label htmlFor={`employeeRelated-${field.key}`}>
                              {field.label}
                              {field.required ? ' *' : ''}
                            </label>
                            {field.lookupEndpoint ? (
                              <select
                                disabled={!isEmployeeRelatedFormEnabled}
                                id={`employeeRelated-${field.key}`}
                                onChange={(event) =>
                                  setEmployeeRelatedFormValues((current) => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }))
                                }
                                required={field.required}
                                value={employeeRelatedFormValues[field.key] ?? ''}
                              >
                                <option value="">Selecione</option>
                                {(employeeRelatedLookups[field.key] ?? []).map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {getLookupLabel(option, field)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                disabled={!isEmployeeRelatedFormEnabled}
                                id={`employeeRelated-${field.key}`}
                                onChange={(event) =>
                                  setEmployeeRelatedFormValues((current) => ({
                                    ...current,
                                    [field.key]: event.target.value,
                                  }))
                                }
                                required={field.required}
                                type={field.type}
                                value={employeeRelatedFormValues[field.key] ?? ''}
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="field">
                        <label htmlFor="employeeRelatedStatus">Status</label>
                        <button
                          aria-pressed={isEmployeeRelatedActive}
                          className={`status-toggle ${isEmployeeRelatedActive ? 'active' : ''}`}
                          disabled={!isEmployeeRelatedFormEnabled}
                          id="employeeRelatedStatus"
                          onClick={handleToggleEmployeeRelatedStatus}
                          type="button"
                        >
                          <span>{isEmployeeRelatedActive ? 'Ativo' : 'Inativo'}</span>
                        </button>
                      </div>

                      <div className="form-actions">
                        <button
                          className="secondary-button"
                          disabled={!selectedEmployeeId}
                          onClick={clearEmployeeRelatedForm}
                          type="button"
                        >
                          Limpar
                        </button>
                        <button disabled={!isEmployeeRelatedFormEnabled} type="submit">
                          <Save size={16} />
                          Salvar {employeeRelatedConfig.label}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : null}
            </form>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas relacionadas do funcionario">
          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas relacionadas do funcionario">
            {employeeRelatedTables.map((table) => (
              <button
                aria-selected={selectedEmployeeRelatedTable === table.key}
                className={selectedEmployeeRelatedTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => handleSelectEmployeeRelatedTable(table.key)}
                role="tab"
                type="button"
              >
                {table.label}
              </button>
            ))}
          </div>
        </section>
      </div>
      {employeeFileModal ? (
        <div className="file-modal-overlay" role="dialog" aria-modal="true">
          <div className="file-modal">
            <div className="file-modal-header">
              <h3>{employeeFileModal.title}</h3>
              <button onClick={() => setEmployeeFileModal(null)} type="button">
                Fechar
              </button>
            </div>
            <img alt={employeeFileModal.title} src={employeeFileModal.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
