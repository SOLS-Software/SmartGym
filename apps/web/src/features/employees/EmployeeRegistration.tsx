'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, formatCpf, formatDateInput, getLookupLabel, isImageFile, isValidCpf, onlyDigits, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';

const _employeeTabIcons = { files: FileText };
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

type DrawerMode = 'employee' | 'related';

export function EmployeeRegistration() {
  const employeeFileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
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
  const [employeeErrors, setEmployeeErrors] = useState<EmployeeValidationErrors>({});
  const [touchedEmployeeFields, setTouchedEmployeeFields] = useState<
    Partial<Record<EmployeeValidationField, boolean>>
  >({});
  const selectedEmployeeRelatedTable = 'files';
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('employee');

  const employeeRelatedConfig =
    employeeRelatedTables.find((table) => table.key === selectedEmployeeRelatedTable) ?? null;
  const filteredEmployeeRelatedRecords = employeeRelatedRecords.filter((record) =>
    employeeRelatedConfig
      ? employeeRelatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column, employeeRelatedLookups[column.key]).includes(employeeRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredEmployees = employees.filter((employee) => {
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
    setTimeout(() => nameInputRef.current?.focus(), 0);
    setDrawerMode('employee');
    setIsDrawerOpen(true);
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
  }

  function handleEditEmployee(employee: Employee) {
    if (employee.id !== selectedEmployeeId) handleSelectEmployee(employee);
    setDrawerMode('employee');
    setIsDrawerOpen(true);
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
    setDrawerMode('related');
    setIsDrawerOpen(true);
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
  }

  function handleEditEmployeeRelated(record: CompanyChildRecord) {
    if (record.id !== selectedEmployeeRelatedRecordId) handleSelectEmployeeRelatedRecord(record);
    setDrawerMode('related');
    setIsDrawerOpen(true);
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
      setIsDrawerOpen(false);
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
      setIsDrawerOpen(false);
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
      setIsDrawerOpen(false);
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

      <div className={`training-page-layout${selectedEmployeeId !== null ? ' has-exercises' : ''}`}>
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
            onEdit={handleEditEmployee}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
            searchPlaceholder="Buscar funcionário"
            onNew={handleNewEmployee}
            page={employeesPage}
            totalItems={filteredEmployees.length}
            onPageChange={setEmployeesPage}
          />
        </section>

        {selectedEmployeeId !== null ? (
          <section className="data-grid-section">
            {employeeRelatedConfig ? (
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
                onEdit={handleEditEmployeeRelated}
                searchTerm={employeeRelatedSearchTerm}
                onSearch={setEmployeeRelatedSearchTerm}
                onNew={handleNewEmployeeRelated}
                newDisabled={!selectedEmployeeId}
                variant="child"
              />
            ) : null}
          </section>
        ) : null}

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={drawerMode === 'employee' ? (isCreating ? 'Novo Funcionário' : 'Editar Funcionário') : 'Arquivo do Funcionário'}
          onClose={() => setIsDrawerOpen(false)}
        >
          {drawerMode === 'employee' ? (
            <form className="drawer-fields" onSubmit={handleSaveEmployee}>
              {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
              <RegistrationField error={employeeErrors.name} htmlFor="employeeName" label="Nome do funcionário" required size="full" touched={touchedEmployeeFields.name}>
                <input className={touchedEmployeeFields.name && employeeErrors.name ? 'invalid' : ''} id="employeeName" maxLength={255} onBlur={() => validateEmployeeField('name')} onChange={(event) => { const value = event.target.value; setEmployeeName(value); if (touchedEmployeeFields.name) { setEmployeeErrors((current) => ({ ...current, name: value.trim() ? undefined : 'Informe o nome do funcionário.' })); } }} placeholder="Ex.: Joao Souza" ref={nameInputRef} type="text" value={employeeName} />
              </RegistrationField>
              <RegistrationField error={employeeErrors.cpf} htmlFor="employeeCpf" label="CPF" required size="md" touched={touchedEmployeeFields.cpf}>
                <input className={touchedEmployeeFields.cpf && employeeErrors.cpf ? 'invalid' : ''} id="employeeCpf" maxLength={14} onBlur={() => validateEmployeeField('cpf')} onChange={(event) => { const formattedCpf = formatCpf(event.target.value); setEmployeeCpf(formattedCpf); if (touchedEmployeeFields.cpf) { setEmployeeErrors((current) => ({ ...current, cpf: isValidCpf(formattedCpf) ? undefined : 'Informe um CPF válido.' })); } }} placeholder="000.000.000-00" ref={cpfInputRef} type="text" value={employeeCpf} />
              </RegistrationField>
              <RegistrationField htmlFor="employeeCompany" label="Empresa" size="lg">
                <select id="employeeCompany" onChange={(event) => setSelectedCompanyId(event.target.value)} value={selectedCompanyId}>
                  <option value="">Selecione</option>
                  {companies.map((company) => (<option key={company.id} value={company.id}>{company.dsEmpresa}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField htmlFor="employeeRole" label="Cargo" size="md">
                <select id="employeeRole" onChange={(event) => setSelectedRoleId(event.target.value)} value={selectedRoleId}>
                  <option value="">Selecione</option>
                  {roles.map((role) => (<option key={role.id} value={role.id}>{role.dsCargo}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField error={employeeErrors.birthDate} htmlFor="employeeBirthDate" label="Nascimento" size="sm" touched={touchedEmployeeFields.birthDate}>
                <input className={touchedEmployeeFields.birthDate && employeeErrors.birthDate ? 'invalid' : ''} id="employeeBirthDate" max={new Date().toISOString().slice(0, 10)} onBlur={() => validateEmployeeField('birthDate')} onChange={(event) => { const value = event.target.value; setEmployeeBirthDate(value); if (touchedEmployeeFields.birthDate) { setEmployeeErrors((current) => ({ ...current, birthDate: !value || isValidPastDate(value) ? undefined : 'Informe uma data de nascimento valida.' })); } }} ref={birthDateInputRef} type="date" value={employeeBirthDate} />
              </RegistrationField>
              <RegistrationField error={employeeErrors.admissionDate} htmlFor="employeeAdmissionDate" label="Admissão" size="sm" touched={touchedEmployeeFields.admissionDate}>
                <input className={touchedEmployeeFields.admissionDate && employeeErrors.admissionDate ? 'invalid' : ''} id="employeeAdmissionDate" onBlur={() => validateEmployeeField('admissionDate')} onChange={(event) => { const value = event.target.value; setEmployeeAdmissionDate(value); if (touchedEmployeeFields.admissionDate) { setEmployeeErrors((current) => ({ ...current, admissionDate: !value || isValidDateInput(value) ? undefined : 'Informe uma data de admissao valida.' })); } }} ref={admissionDateInputRef} type="date" value={employeeAdmissionDate} />
              </RegistrationField>
              <RegistrationField error={employeeErrors.ddd} htmlFor="employeeDdd" label="DDD" size="xs" touched={touchedEmployeeFields.ddd}>
                <input className={touchedEmployeeFields.ddd && employeeErrors.ddd ? 'invalid' : ''} id="employeeDdd" maxLength={2} onBlur={() => validateEmployeeField('ddd')} onChange={(event) => { const value = onlyDigits(event.target.value).slice(0, 2); setEmployeeDdd(value); if (touchedEmployeeFields.ddd || touchedEmployeeFields.phone) { const phone = onlyDigits(employeePhone); setEmployeeErrors((current) => ({ ...current, ddd: phone && !value ? 'Informe o DDD do contato.' : value && value.length !== 2 ? 'Informe o DDD com 2 digitos.' : undefined, phone: value && !phone ? 'Informe o contato.' : current.phone })); } }} placeholder="11" ref={dddInputRef} type="text" value={employeeDdd} />
              </RegistrationField>
              <RegistrationField error={employeeErrors.phone} htmlFor="employeePhone" label="Contato" size="sm" touched={touchedEmployeeFields.phone}>
                <input className={touchedEmployeeFields.phone && employeeErrors.phone ? 'invalid' : ''} id="employeePhone" maxLength={10} onBlur={() => validateEmployeeField('phone')} onChange={(event) => { const formattedPhone = formatPhone(event.target.value); const phone = onlyDigits(formattedPhone); setEmployeePhone(formattedPhone); if (touchedEmployeeFields.phone || touchedEmployeeFields.ddd) { setEmployeeErrors((current) => ({ ...current, ddd: phone && !employeeDdd ? 'Informe o DDD do contato.' : current.ddd, phone: phone && phone.length !== 8 && phone.length !== 9 ? 'Informe um contato com 8 ou 9 digitos.' : employeeDdd && !phone ? 'Informe o contato.' : undefined })); } }} placeholder="00000-0000" ref={phoneInputRef} type="text" value={employeePhone} />
              </RegistrationField>
              <RegistrationField error={employeeErrors.email} htmlFor="employeeEmail" label="Email" size="lg" touched={touchedEmployeeFields.email}>
                <input className={touchedEmployeeFields.email && employeeErrors.email ? 'invalid' : ''} id="employeeEmail" maxLength={100} onBlur={() => validateEmployeeField('email')} onChange={(event) => { const value = event.target.value; setEmployeeEmail(value); if (touchedEmployeeFields.email) { const trimmedEmail = value.trim(); setEmployeeErrors((current) => ({ ...current, email: trimmedEmail && !isValidEmail(trimmedEmail) ? 'Informe um email válido.' : undefined })); } }} placeholder="profissional@email.com" ref={emailInputRef} type="email" value={employeeEmail} />
              </RegistrationField>
              <RegistrationField htmlFor="employeeStatus" label="Status" size="sm">
                <button aria-pressed={isEmployeeActive} className={`status-toggle ${isEmployeeActive ? 'active' : ''}`} id="employeeStatus" onClick={handleToggleEmployeeStatus} type="button">
                  <span>{isEmployeeActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                <button type="submit"><Save size={16} />Salvar funcionário</button>
              </div>
            </form>
          ) : (
            <form className="drawer-fields" onSubmit={handleSaveEmployeeRelated}>
              {employeeRelatedFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{employeeRelatedFeedback}</div> : null}
              <RegistrationField htmlFor="employeeFileType" label="Tipo de arquivo" size="md">
                <select disabled={!selectedEmployeeId || isUploadingEmployeeFile} id="employeeFileType" onChange={(event) => setEmployeeRelatedFormValues((current) => ({ ...current, idTiposArquivos: event.target.value }))} value={employeeRelatedFormValues.idTiposArquivos ?? ''}>
                  <option value="">Selecione</option>
                  {(employeeRelatedLookups.idTiposArquivos ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, employeeRelatedConfig?.fields.find((field) => field.key === 'idTiposArquivos') ?? employeeRelatedConfig?.fields[0]!)}</option>))}
                </select>
              </RegistrationField>
              <RegistrationField htmlFor="employeeFileName" label="Arquivo selecionado" size="full">
                <input disabled id="employeeFileName" type="text" value={selectedEmployeeRelatedRecordId ? String(employeeRelatedRecords.find((record) => record.id === selectedEmployeeRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedEmployeeRelatedRecordId}`) : 'Selecione no grid ou clique em Novo'} />
              </RegistrationField>
              <RegistrationField htmlFor="employeeFile" label={selectedEmployeeRelatedRecordId && !isCreatingEmployeeRelated ? 'Alterar arquivo' : 'Arquivo'} size="full">
                <input disabled={!selectedEmployeeId || isUploadingEmployeeFile} id="employeeFile" onChange={(event) => void handleUploadEmployeeFile(event.target.files?.[0] ?? null)} ref={employeeFileInputRef} type="file" />
              </RegistrationField>
              {selectedEmployeeRelatedRecordId ? (
                <div className="student-files-list" style={{ flex: '1 1 100%' }}>
                  <div className="student-file-row">
                    {employeeFilePreviewUrls[selectedEmployeeRelatedRecordId] ? (
                      <button className="file-preview-button" onClick={() => void handleOpenEmployeeFile(selectedEmployeeRelatedRecordId)} type="button">
                        <img alt={String(employeeRelatedRecords.find((record) => record.id === selectedEmployeeRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedEmployeeRelatedRecordId}`)} className="student-file-preview" src={employeeFilePreviewUrls[selectedEmployeeRelatedRecordId]} />
                      </button>
                    ) : null}
                    <div className="student-file-row-info">
                      <strong>{String(employeeRelatedRecords.find((record) => record.id === selectedEmployeeRelatedRecordId)?.dsArquivo ?? `Arquivo ${selectedEmployeeRelatedRecordId}`)}</strong>
                    </div>
                    <div className="student-file-actions">
                      <button className="secondary-button" onClick={() => void handleOpenEmployeeFile(selectedEmployeeRelatedRecordId)} type="button">Visualizar</button>
                      <button className="secondary-button" onClick={() => employeeFileInputRef.current?.click()} type="button">Alterar</button>
                      <button className="danger" onClick={() => void handleRemoveEmployeeFile(selectedEmployeeRelatedRecordId)} type="button">Remover</button>
                    </div>
                  </div>
                </div>
              ) : selectedEmployeeId ? (
                <div className="form-hint">Selecione um arquivo no grid para visualizar ou alterar.</div>
              ) : null}
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
              </div>
            </form>
          )}
        </RegistrationDrawer>
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
