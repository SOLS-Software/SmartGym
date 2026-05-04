'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GRID_PAGE_SIZE, GridPagination, formatChildCell, formatChildSearchValue, formatCpf, formatDateInput, isImageFile, isValidCpf, onlyDigits, paginateItems } from './registration-helpers';
import type { CompanyChildColumn, CompanyChildRecord, Student, StudentFile, StudentRelatedTable, StudentValidationErrors, StudentValidationField } from './registration-types';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

const studentRelatedTables: StudentRelatedTable[] = [
  {
    key: 'files',
    endpoint: 'files',
    label: 'Arquivos',
    title: 'Arquivos do aluno',
    columns: [
      { key: 'dsArquivo', label: 'Arquivo' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
  {
    key: 'plans',
    endpoint: 'plans',
    label: 'Planos',
    title: 'Planos do aluno',
    columns: [
      { key: 'idPlano', label: 'ID plano' },
      { key: 'nrDiaPagamento', label: 'Dia pgto' },
      { key: 'dtAdmissao', label: 'Admissão', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
  {
    key: 'payments',
    endpoint: 'payments',
    label: 'Pagamentos',
    title: 'Pagamentos do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'ID plano aluno' },
      { key: 'vlPagamento', label: 'Valor', type: 'money' },
      { key: 'dtPagamento', label: 'Pagamento', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
    ],
  },
  {
    key: 'checkIns',
    endpoint: 'check-ins',
    label: 'Check-ins',
    title: 'Check-ins do aluno',
    columns: [
      { key: 'idAlunoPlano', label: 'ID plano aluno' },
      { key: 'idPontos', label: 'ID pontos' },
      { key: 'dtCadastro', label: 'Cadastro', type: 'date' },
      { key: 'boInativo', label: 'Status', type: 'status' },
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


function toApiDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return null;
}


function isValidBirthDate(value: string) {
  const apiDate = toApiDate(value);

  if (!apiDate) {
    return false;
  }

  const [yearValue, monthValue, dayValue] = apiDate.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date(new Date().setHours(0, 0, 0, 0))
  );
}


function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


export function StudentRegistration() {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cpfInputRef = useRef<HTMLInputElement>(null);
  const birthDateInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsPage, setStudentsPage] = useState(1);
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
  const [isStudentActive, setIsStudentActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isStudentFieldsCollapsed, setIsStudentFieldsCollapsed] = useState(false);
  const [isStudentFilesCollapsed, setIsStudentFilesCollapsed] = useState(false);
  const [selectedStudentRelatedTable, setSelectedStudentRelatedTable] = useState('');
  const [studentRelatedRecords, setStudentRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingStudentRelatedRecords, setIsLoadingStudentRelatedRecords] = useState(false);
  const [studentRelatedSearchTerm, setStudentRelatedSearchTerm] = useState('');
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState('');
  const [studentErrors, setStudentErrors] = useState<StudentValidationErrors>({});
  const [touchedStudentFields, setTouchedStudentFields] = useState<
    Partial<Record<StudentValidationField, boolean>>
  >({});
  const isFormEnabled = selectedStudentId !== null || isCreating;
  const studentRelatedConfig =
    studentRelatedTables.find((table) => table.key === selectedStudentRelatedTable) ?? null;
  const filteredStudentRelatedRecords = studentRelatedRecords.filter((record) =>
    studentRelatedConfig
      ? studentRelatedConfig.columns.some((column) =>
        formatChildSearchValue(record, column).includes(studentRelatedSearchTerm.toLowerCase()),
      )
      : false,
  );
  const filteredStudents = students.filter((student) => {
    const search = searchTerm.toLowerCase();

    return (
      student.nmAluno.toLowerCase().includes(search) ||
      student.caCPF.includes(searchTerm.replace(/\D/g, '')) ||
      student.anEmail.toLowerCase().includes(search)
    );
  });
  const studentsTotalPages = Math.max(1, Math.ceil(filteredStudents.length / GRID_PAGE_SIZE));
  const paginatedStudents = paginateItems(filteredStudents, studentsPage);

  async function loadStudents() {
    try {
      const response = await fetch(`${apiUrl}/students`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os alunos.');
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
    setStudentsPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (studentsPage > studentsTotalPages) {
      setStudentsPage(studentsTotalPages);
    }
  }, [studentsPage, studentsTotalPages]);

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentFiles([]);
      setPreviewUrls({});
      setFileFeedback('');
      return;
    }

    void loadStudentFiles(selectedStudentId);
  }, [selectedStudentId]);

  useEffect(() => {
    setStudentRelatedSearchTerm('');
    void loadStudentRelatedRecords();
  }, [selectedStudentId, selectedStudentRelatedTable]);

  useEffect(() => {
    if (!isCameraModalOpen || !cameraStreamRef.current || !cameraVideoRef.current) {
      return;
    }

    cameraVideoRef.current.srcObject = cameraStreamRef.current;
    void cameraVideoRef.current.play();
  }, [isCameraModalOpen]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        for (const track of cameraStreamRef.current.getTracks()) {
          track.stop();
        }
        cameraStreamRef.current = null;
      }
    };
  }, []);

  function stopCameraStream() {
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }

  async function loadStudentFiles(studentId: number) {
    try {
      const response = await fetch(`${apiUrl}/students/${studentId}/files`);

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os arquivos do aluno.');
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

  async function loadStudentRelatedRecords(
    studentId = selectedStudentId,
    config = studentRelatedConfig,
  ) {
    if (!config || !studentId) {
      setStudentRelatedRecords([]);
      setIsLoadingStudentRelatedRecords(false);
      return;
    }

    try {
      setIsLoadingStudentRelatedRecords(true);
      const response = await fetch(
        config.key === 'files'
          ? `${apiUrl}/students/${studentId}/files`
          : `${apiUrl}/students/${studentId}/related/${config.endpoint}`,
      );

      if (!response.ok) {
        throw new Error('Nao foi possivel carregar os registros relacionados.');
      }

      const data = (await response.json()) as CompanyChildRecord[];
      setStudentRelatedRecords(data);
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar registros relacionados.',
      );
      setStudentRelatedRecords([]);
    } finally {
      setIsLoadingStudentRelatedRecords(false);
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
    setIsStudentActive(false);
    setStudentErrors({});
    setTouchedStudentFields({});
    setFeedback('');
    setFileFeedback('');
    setCameraFeedback('');
    setStudentFiles([]);
    setPreviewUrls({});
    setStudentRelatedRecords([]);
    setStudentRelatedSearchTerm('');
    setIsCameraModalOpen(false);
    setIsCapturingPhoto(false);
    stopCameraStream();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  }

  function handleNewStudent() {
    clearForm();
    setIsCreating(true);
    setIsStudentActive(true);
  }

  function handleSelectStudent(student: Student) {
    setSelectedStudentId(student.id);
    setIsCreating(false);
    setStudentName(student.nmAluno);
    setStudentCpf(formatCpf(student.caCPF));
    setStudentBirthDate(formatDateInput(student.dtNascimento));
    setStudentDdd(student.nrDDD ? String(student.nrDDD) : '');
    setStudentPhone(formatPhone(student.nrContato ?? ''));
    setStudentEmail(student.anEmail);
    setStudentCep(student.anCEP);
    setStudentAddress(student.anLogradouro);
    setStudentAddressNumber(
      student.nrEndereco === null ? '' : String(student.nrEndereco),
    );
    setIsStudentActive(student.boInativo === 0);
    setFeedback('');
    setFileFeedback('');
    setStudentErrors({});
    setTouchedStudentFields({});
  }

  function handleSelectStudentRelatedTable(tableKey: string) {
    setSelectedStudentRelatedTable(tableKey);
    setIsStudentFilesCollapsed(false);
    setFileFeedback('');

    if (tableKey !== 'files') {
      setIsCameraModalOpen(false);
      setIsCapturingPhoto(false);
      setCameraFeedback('');
      stopCameraStream();
    }
  }

  function getStudentValidationErrors() {
    const errors: StudentValidationErrors = {};
    const trimmedEmail = studentEmail.trim();

    if (!studentName.trim()) {
      errors.name = 'Informe o nome do aluno.';
    }

    if (!isValidCpf(studentCpf)) {
      errors.cpf = 'Informe um CPF valido.';
    }

    if (!studentBirthDate) {
      errors.birthDate = 'Informe a data de nascimento.';
    } else if (!isValidBirthDate(studentBirthDate)) {
      errors.birthDate = 'Informe uma data de nascimento valida.';
    }

    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      errors.email = 'Informe um email valido.';
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
      birthDateInputRef.current?.focus();
      return;
    }

    if (errors.email) {
      emailInputRef.current?.focus();
    }
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
        throw new Error('Nao foi possivel alterar o status.');
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

  async function handleSaveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
        nmAluno: studentName,
        caCPF: onlyDigits(studentCpf),
        dtNascimento: apiBirthDate,
        nrDDD: Number(studentDdd || 0),
        nrContato: onlyDigits(studentPhone) || null,
        anEmail: trimmedEmail,
        anCEP: studentCep,
        anLogradouro: studentAddress,
        nrEndereco: studentAddressNumber ? Number(studentAddressNumber) : null,
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
        throw new Error(errorBody.message ?? 'Nao foi possivel salvar.');
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

  async function handleUploadStudentFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!selectedStudentId) {
      setFileFeedback('Salve o aluno antes de anexar arquivos.');
      return;
    }

    try {
      setIsUploadingFile(true);
      setFileFeedback('');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/students/${selectedStudentId}/files`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Nao foi possivel enviar o arquivo.');
      }

      await loadStudentFiles(selectedStudentId);
      if (selectedStudentRelatedTable === 'files') {
        await loadStudentRelatedRecords(selectedStudentId, studentRelatedConfig);
      }
      setFileFeedback('Arquivo enviado com sucesso.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao enviar arquivo.',
      );
    } finally {
      setIsUploadingFile(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    }
  }

  function handleOpenCameraCapture() {
    if (!selectedStudentId || isUploadingFile) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setFileFeedback('Camera nao suportada neste navegador.');
      cameraInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        setCameraFeedback('');

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: {
              ideal: 'environment',
            },
          },
        });

        cameraStreamRef.current = stream;
        setIsCameraModalOpen(true);
      } catch {
        setFileFeedback('Nao foi possivel acessar a camera. Selecione um arquivo.');
        cameraInputRef.current?.click();
      }
    })();
  }

  function handleCloseCameraCapture() {
    setIsCameraModalOpen(false);
    setIsCapturingPhoto(false);
    setCameraFeedback('');
    stopCameraStream();
  }

  async function handleCaptureCameraPhoto() {
    if (!selectedStudentId || !cameraVideoRef.current || isCapturingPhoto) {
      return;
    }

    try {
      setIsCapturingPhoto(true);
      setCameraFeedback('');

      const video = cameraVideoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Nao foi possivel capturar a imagem.');
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (!blob) {
        throw new Error('Nao foi possivel capturar a imagem.');
      }

      const file = new File([blob], `aluno-${selectedStudentId}-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });

      handleCloseCameraCapture();
      await handleUploadStudentFile(file);
    } catch (error) {
      setCameraFeedback(
        error instanceof Error ? error.message : 'Erro ao capturar a foto.',
      );
      setIsCapturingPhoto(false);
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
        throw new Error(errorBody.message ?? 'Nao foi possivel abrir o arquivo.');
      }

      const data = (await response.json()) as { url: string };
      window.open(data.url, '_blank', 'noopener,noreferrer');
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
        throw new Error(errorBody.message ?? 'Nao foi possivel remover o arquivo.');
      }

      await loadStudentFiles(selectedStudentId);
      if (selectedStudentRelatedTable === 'files') {
        await loadStudentRelatedRecords(selectedStudentId, studentRelatedConfig);
      }
      setFileFeedback('Arquivo removido.');
    } catch (error) {
      setFileFeedback(
        error instanceof Error ? error.message : 'Erro ao remover arquivo.',
      );
    }
  }

  return (
    <div className="form-view">
      <div className="form-heading">
        <p className="section-label">Matrículas</p>
      </div>

      <div className="registration-split-layout student-split-layout">
        <section className="data-grid-section">
          <div className="grid-toolbar">
            <div className="child-grid-toolbar-label">
              <p className="section-label">Alunos</p>
            </div>
            <div className="child-grid-toolbar-actions">
              <label className="search-field">
                <span>Pesquisar</span>
                <input
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar aluno"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button className="new-button" onClick={handleNewStudent} type="button">
                Novo aluno
              </button>
            </div>
          </div>

          <div className="product-table" role="table" aria-label="Alunos cadastrados">
            <div className="product-row header" role="row">
              <span role="columnheader">Aluno</span>
              <span role="columnheader">CPF</span>
              <span role="columnheader">Status</span>
            </div>

            {paginatedStudents.map((student) => (
              <button
                className={`product-row selectable ${student.id === selectedStudentId ? 'selected' : ''
                  }`}
                key={student.id}
                onClick={() => handleSelectStudent(student)}
                role="row"
                type="button"
              >
                <span role="cell">{student.nmAluno}</span>
                <span role="cell">{formatCpf(student.caCPF)}</span>
                <span role="cell">
                  <span
                    className={`status-badge ${student.boInativo === 0 ? 'active' : 'inactive'
                      }`}
                  >
                    {student.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                </span>
              </button>
            ))}

            {filteredStudents.length === 0 ? (
              <div className="empty-row">Nenhum aluno encontrado.</div>
            ) : null}
          </div>
          <GridPagination
            onChange={setStudentsPage}
            page={studentsPage}
            totalItems={filteredStudents.length}
          />

          {studentRelatedConfig ? (
            <section className="company-child-grid-section">
              {!selectedStudentId ? (
                <div className="form-hint">
                  Selecione um aluno para visualizar os registros relacionados.
                </div>
              ) : (
                <>
                  <div className="grid-toolbar">
                    <div className="child-grid-toolbar-label">
                      <p className="section-label">{studentRelatedConfig.label}</p>
                    </div>
                    <div className="child-grid-toolbar-actions">
                      <label className="search-field">
                        <span>Pesquisar</span>
                        <input
                          onChange={(event) => setStudentRelatedSearchTerm(event.target.value)}
                          placeholder="Buscar registro"
                          type="search"
                          value={studentRelatedSearchTerm}
                        />
                      </label>
                    </div>
                  </div>

                  <div
                    className="product-table company-child-grid-table"
                    role="table"
                    aria-label={studentRelatedConfig.title}
                  >
                    <div
                      className="product-row company-child-grid-row header"
                      role="row"
                      style={{
                        gridTemplateColumns: `repeat(${studentRelatedConfig.columns.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {studentRelatedConfig.columns.map((column) => (
                        <span key={column.key} role="columnheader">
                          {column.label}
                        </span>
                      ))}
                    </div>

                    {isLoadingStudentRelatedRecords ? (
                      <div className="empty-row">
                        Carregando {studentRelatedConfig.label.toLowerCase()}...
                      </div>
                    ) : null}

                    {!isLoadingStudentRelatedRecords
                      ? filteredStudentRelatedRecords.map((record) => (
                        <div
                          className="product-row company-child-grid-row"
                          key={record.id}
                          role="row"
                          style={{
                            gridTemplateColumns: `repeat(${studentRelatedConfig.columns.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {studentRelatedConfig.columns.map((column) => (
                            <span key={column.key} role="cell">
                              {formatChildCell(record, column)}
                            </span>
                          ))}
                        </div>
                      ))
                      : null}

                    {!isLoadingStudentRelatedRecords && filteredStudentRelatedRecords.length === 0 ? (
                      <div className="empty-row">
                        Nenhum registro de {studentRelatedConfig.label.toLowerCase()} encontrado.
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
        </section>

        <div className="split-form-stack">
          <form
            className={`registration-form split-form-panel ${isStudentFieldsCollapsed ? 'collapsed' : ''}`}
            onSubmit={handleSaveStudent}
          >
            <div className="collapsible-panel-header">
              <div>
                <p className="section-label">Aluno</p>
              </div>
              <button
                aria-expanded={!isStudentFieldsCollapsed}
                className="secondary-button"
                onClick={() => setIsStudentFieldsCollapsed((current) => !current)}
                type="button"
              >
                {isStudentFieldsCollapsed ? '+' : '-'}
              </button>
            </div>

            {!isStudentFieldsCollapsed ? (
              <>
                {!isFormEnabled ? (
                  <div className="form-hint">
                    Selecione um aluno acima para editar ou clique em Novo aluno.
                  </div>
                ) : null}

                {feedback ? <div className="form-feedback">{feedback}</div> : null}

                <div className="field">
                  <label htmlFor="nmAluno">Nome *</label>
                  <input
                    className={
                      touchedStudentFields.name && studentErrors.name ? 'invalid' : ''
                    }
                    disabled={!isFormEnabled}
                    id="nmAluno"
                    maxLength={255}
                    onBlur={() => validateStudentField('name')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStudentName(value);

                      if (touchedStudentFields.name) {
                        setStudentErrors((current) => ({
                          ...current,
                          name: value.trim() ? undefined : 'Informe o nome do aluno.',
                        }));
                      }
                    }}
                    placeholder="Ex.: Maria Souza"
                    ref={nameInputRef}
                    type="text"
                    value={studentName}
                  />
                  {touchedStudentFields.name && studentErrors.name ? (
                    <span className="field-error">{studentErrors.name}</span>
                  ) : null}
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="caCPF">CPF</label>
                    <input
                      className={
                        touchedStudentFields.cpf && studentErrors.cpf ? 'invalid' : ''
                      }
                      disabled={!isFormEnabled}
                      id="caCPF"
                      maxLength={14}
                      onBlur={() => validateStudentField('cpf')}
                      onChange={(event) => {
                        const formattedCpf = formatCpf(event.target.value);
                        setStudentCpf(formattedCpf);

                        if (touchedStudentFields.cpf) {
                          setStudentErrors((current) => ({
                            ...current,
                            cpf: isValidCpf(formattedCpf)
                              ? undefined
                              : 'Informe um CPF valido.',
                          }));
                        }
                      }}
                      placeholder="000.000.000-00"
                      ref={cpfInputRef}
                      type="text"
                      value={studentCpf}
                    />
                    {touchedStudentFields.cpf && studentErrors.cpf ? (
                      <span className="field-error">{studentErrors.cpf}</span>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="dtNascimento">Data de nascimento *</label>
                    <input
                      className={
                        touchedStudentFields.birthDate && studentErrors.birthDate
                          ? 'invalid'
                          : ''
                      }
                      disabled={!isFormEnabled}
                      id="dtNascimento"
                      max={new Date().toISOString().slice(0, 10)}
                      onBlur={() => validateStudentField('birthDate')}
                      onChange={(event) => {
                        const value = event.target.value;
                        setStudentBirthDate(value);

                        if (touchedStudentFields.birthDate) {
                          setStudentErrors((current) => ({
                            ...current,
                            birthDate: isValidBirthDate(value)
                              ? undefined
                              : 'Informe uma data de nascimento valida.',
                          }));
                        }
                      }}
                      ref={birthDateInputRef}
                      type="date"
                      value={studentBirthDate}
                    />
                    {touchedStudentFields.birthDate && studentErrors.birthDate ? (
                      <span className="field-error">{studentErrors.birthDate}</span>
                    ) : null}
                  </div>
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="nrDDD">DDD</label>
                    <input
                      disabled={!isFormEnabled}
                      id="nrDDD"
                      maxLength={2}
                      onChange={(event) => setStudentDdd(event.target.value)}
                      placeholder="11"
                      type="text"
                      value={studentDdd}
                    />
                  </div>
                  <div>
                    <label htmlFor="nrContato">Telefone</label>
                    <input
                      disabled={!isFormEnabled}
                      id="nrContato"
                      maxLength={10}
                      onChange={(event) => setStudentPhone(formatPhone(event.target.value))}
                      placeholder="00000-0000"
                      type="text"
                      value={studentPhone}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="anEmail">Email</label>
                  <input
                    className={
                      touchedStudentFields.email && studentErrors.email ? 'invalid' : ''
                    }
                    disabled={!isFormEnabled}
                    id="anEmail"
                    maxLength={100}
                    onBlur={() => validateStudentField('email')}
                    onChange={(event) => {
                      const value = event.target.value;
                      setStudentEmail(value);

                      if (touchedStudentFields.email) {
                        const trimmedEmail = value.trim();
                        setStudentErrors((current) => ({
                          ...current,
                          email:
                            trimmedEmail && !isValidEmail(trimmedEmail)
                              ? 'Informe um email valido.'
                              : undefined,
                        }));
                      }
                    }}
                    placeholder="aluno@email.com"
                    ref={emailInputRef}
                    type="email"
                    value={studentEmail}
                  />
                  {touchedStudentFields.email && studentErrors.email ? (
                    <span className="field-error">{studentErrors.email}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="anLogradouro">Logradouro</label>
                  <input
                    disabled={!isFormEnabled}
                    id="anLogradouro"
                    maxLength={100}
                    onChange={(event) => setStudentAddress(event.target.value)}
                    placeholder="Rua, avenida..."
                    type="text"
                    value={studentAddress}
                  />
                </div>

                <div className="field two-columns">
                  <div>
                    <label htmlFor="anCEP">CEP</label>
                    <input
                      disabled={!isFormEnabled}
                      id="anCEP"
                      maxLength={8}
                      onChange={(event) => setStudentCep(event.target.value)}
                      placeholder="Somente numeros"
                      type="text"
                      value={studentCep}
                    />
                  </div>
                  <div>
                    <label htmlFor="nrEndereco">Número</label>
                    <input
                      disabled={!isFormEnabled}
                      id="nrEndereco"
                      onChange={(event) => setStudentAddressNumber(event.target.value)}
                      placeholder="0"
                      type="number"
                      value={studentAddressNumber}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="studentStatus">Status</label>
                  <button
                    aria-pressed={isStudentActive}
                    className={`status-toggle ${isStudentActive ? 'active' : ''}`}
                    disabled={!isFormEnabled}
                    id="studentStatus"
                    onClick={handleToggleStatus}
                    type="button"
                  >
                    <span>{isStudentActive ? 'Ativo' : 'Inativo'}</span>
                  </button>
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
                    Salvar aluno
                  </button>
                </div>
              </>
            ) : null}
          </form>

          {selectedStudentRelatedTable === 'files' ? (
            <section className={`registration-form student-files-section ${isStudentFilesCollapsed ? 'collapsed' : ''}`}>
              <div className="student-files-header collapsible-panel-header">
                <div>
                  <p className="section-label">Arquivos</p>
                </div>
                <button
                  aria-expanded={!isStudentFilesCollapsed}
                  className="secondary-button"
                  onClick={() => setIsStudentFilesCollapsed((current) => !current)}
                  type="button"
                >
                  {isStudentFilesCollapsed ? '+' : '-'}
                </button>
              </div>

              {!isStudentFilesCollapsed ? (
                <>
                  {!selectedStudentId ? (
                    <div className="form-hint">
                      Salve ou selecione um aluno para anexar arquivos.
                    </div>
                  ) : null}

                  {fileFeedback ? <div className="form-feedback">{fileFeedback}</div> : null}

                  <div className="field">
                    <label htmlFor="studentFile">Selecionar arquivo</label>
                    <div className="file-upload-controls">
                      <input
                        disabled={!selectedStudentId || isUploadingFile}
                        id="studentFile"
                        onChange={(event) =>
                          void handleUploadStudentFile(event.target.files?.[0] ?? null)
                        }
                        ref={fileInputRef}
                        type="file"
                      />
                      <button
                        className="secondary-button"
                        disabled={!selectedStudentId || isUploadingFile}
                        onClick={handleOpenCameraCapture}
                        type="button"
                      >
                        Tirar foto
                      </button>
                    </div>
                    <input
                      accept="image/*"
                      capture="environment"
                      className="camera-capture-input"
                      disabled={!selectedStudentId || isUploadingFile}
                      onChange={(event) =>
                        void handleUploadStudentFile(event.target.files?.[0] ?? null)
                      }
                      ref={cameraInputRef}
                      type="file"
                    />
                  </div>

                  {isCameraModalOpen ? (
                    <div className="camera-modal-overlay" role="dialog" aria-modal="true">
                      <div className="camera-modal">
                        <h4>Capturar foto</h4>
                        <video
                          autoPlay
                          className="camera-live-preview"
                          muted
                          playsInline
                          ref={cameraVideoRef}
                        />
                        {cameraFeedback ? (
                          <p className="camera-modal-feedback">{cameraFeedback}</p>
                        ) : null}
                        <div className="camera-modal-actions">
                          <button
                            className="secondary-button"
                            onClick={handleCloseCameraCapture}
                            type="button"
                          >
                            Cancelar
                          </button>
                          <button
                            disabled={isCapturingPhoto || isUploadingFile}
                            onClick={() => void handleCaptureCameraPhoto()}
                            type="button"
                          >
                            {isCapturingPhoto ? 'Capturando...' : 'Capturar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="student-files-list">
                    {studentFiles.map((file) => (
                      <div className="student-file-row" key={file.id}>
                        {previewUrls[file.id] ? (
                          <img
                            alt={file.anCaminho.split('/').pop()}
                            className="student-file-preview"
                            src={previewUrls[file.id]}
                          />
                        ) : null}
                        <div className="student-file-row-info">
                          <strong>{file.anCaminho.split('/').pop()}</strong>
                          <span>{file.anCaminho}</span>
                        </div>
                        <div className="student-file-actions">
                          <button
                            className="secondary-button"
                            onClick={() => void handleOpenStudentFile(file.id)}
                            type="button"
                          >
                            Abrir
                          </button>
                          <button
                            className="secondary-button danger"
                            onClick={() => void handleRemoveStudentFile(file.id)}
                            type="button"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}

                    {selectedStudentId && studentFiles.length === 0 ? (
                      <div className="empty-row">Nenhum arquivo anexado.</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </section>
          ) : selectedStudentRelatedTable ? (
            <section className="registration-form student-files-section">
              <div className="collapsible-panel-header">
                <div>
                  <p className="section-label">
                    {studentRelatedTables.find((table) => table.key === selectedStudentRelatedTable)?.label}
                  </p>
                </div>
              </div>
              <div className="form-hint">Tabela relacionada preparada para os próximos cadastros.</div>
            </section>
          ) : null}
        </div>

        <section className="company-child-tabs" aria-label="Tabelas relacionadas do aluno">
          <div className="company-child-tabs-list" role="tablist" aria-label="Tabelas relacionadas do aluno">
            {studentRelatedTables.map((table) => (
              <button
                aria-selected={selectedStudentRelatedTable === table.key}
                className={selectedStudentRelatedTable === table.key ? 'active' : ''}
                key={table.key}
                onClick={() => handleSelectStudentRelatedTable(table.key)}
                role="tab"
                type="button"
              >
                {table.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
