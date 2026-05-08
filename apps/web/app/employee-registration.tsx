'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, formatCpf, formatDateInput, isValidCpf, onlyDigits, paginateItems } from './registration-helpers';
import type { Company, Employee, Role } from './registration-types';
import { apiFetch as fetch, apiUrl } from './api-fetch';
type EmployeeValidationField =
  | 'name'
  | 'cpf'
  | 'birthDate'
  | 'admissionDate'
  | 'ddd'
  | 'phone'
  | 'email';
type EmployeeValidationErrors = Partial<Record<EmployeeValidationField, string>>;

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
  const [isEmployeeFieldsCollapsed, setIsEmployeeFieldsCollapsed] = useState(false);
  const [employeeErrors, setEmployeeErrors] = useState<EmployeeValidationErrors>({});
  const [touchedEmployeeFields, setTouchedEmployeeFields] = useState<
    Partial<Record<EmployeeValidationField, boolean>>
  >({});
  const isFormEnabled = selectedEmployeeId !== null || isCreating;
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
        throw new Error('Não foi possível carregar os funcionários.');
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

      if (!companiesResponse.ok || !rolesResponse.ok) {
        throw new Error('Não foi possível carregar empresas e cargos.');
      }

      const companiesData = (await companiesResponse.json()) as Company[];
      const rolesData = (await rolesResponse.json()) as Role[];
      setCompanies(companiesData.filter((company) => company.boInativo === 0));
      setRoles(rolesData.filter((role) => role.boInativo === 0));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Erro ao carregar listas.');
    }
  }

  useEffect(() => {
    void loadEmployees();
    void loadLookups();
  }, []);

  useEffect(() => {
    setEmployeesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (employeesPage > employeesTotalPages) {
      setEmployeesPage(employeesTotalPages);
    }
  }, [employeesPage, employeesTotalPages]);

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
  }

  function handleNewEmployee() {
    clearForm();
    setIsCreating(true);
    setIsEmployeeActive(true);
    setEmployeeAdmissionDate(new Date().toISOString().slice(0, 10));
  }

  function handleSelectEmployee(employee: Employee) {
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
        throw new Error('Não foi possível alterar o status.');
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
        nrDDD: Number(employeeDdd || 0),
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

  return (
    <div className="form-view company-view">
      <div className="form-heading">
        <p className="section-label">Profissionais</p>
      </div>

      <div className="registration-split-layout">
        <section className="data-grid-section company-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Funcionários</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar funcionário"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button className="new-button" onClick={handleNewEmployee} type="button">
                Novo
              </button>
            </div>
          </div>

          <div className="product-table" role="table" aria-label="Funcionários cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Funcionário</span>
              <span role="columnheader">Cargo</span>
              <span role="columnheader">Status</span>
            </div>

            {isLoadingEmployees ? <div className="empty-row">Carregando funcionários...</div> : null}

            {!isLoadingEmployees
              ? paginatedEmployees.map((employee) => (
                <button
                  className={`product-row selectable ${employee.id === selectedEmployeeId ? 'selected' : ''}`}
                  key={employee.id}
                  onClick={() => handleSelectEmployee(employee)}
                  role="row"
                  type="button"
                >
                  <span role="cell">{employee.nmFuncionario}</span>
                  <span role="cell">{getRoleLabel(employee.idCargo)}</span>
                  <span role="cell">
                    <span className={`status-badge ${employee.boInativo === 0 ? 'active' : 'inactive'}`}>
                      {employee.boInativo === 0 ? 'Ativo' : 'Inativo'}
                    </span>
                  </span>
                </button>
              ))
              : null}

            {!isLoadingEmployees && filteredEmployees.length === 0 ? (
              <div className="empty-row">Nenhum funcionário encontrado.</div>
            ) : null}
          </div>

          <GridPagination
            onChange={setEmployeesPage}
            page={employeesPage}
            totalItems={filteredEmployees.length}
          />
        </section>

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
                  Salvar funcionário
                </button>
              </div>
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}
