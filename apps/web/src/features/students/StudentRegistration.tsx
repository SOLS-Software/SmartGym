'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, FileText, Receipt, Save } from 'lucide-react';
import { GRID_PAGE_SIZE, formatChildCell, formatChildSearchValue, formatCpf, formatDateInput, getLookupLabel, isImageFile, isValidCpf, onlyDigits, paginateItems } from '../../shared/registration/registrationHelpers';
import { RegistrationDrawer } from '../../shared/registration/RegistrationDrawer';
import { RegistrationField } from '../../shared/registration/RegistrationField';
import { RegistrationGrid } from '../../shared/registration/RegistrationGrid';
import { RegistrationTabs } from '../../shared/registration/RegistrationTabs';
import type { CompanyChildRecord, LookupRecord, Student, StudentFile, StudentValidationErrors, StudentValidationField } from '../../shared/registration/registrationTypes';
import { apiFetch as fetch, apiUrl, getApiError } from '../../shared/api/apiFetch';
import { studentRelatedTables } from './studentRelatedTables';
import { formatPhone, isValidBirthDate, isValidEmail, toApiDate } from './studentValidation';

const studentTabIcons = {
  files: FileText,
  plans: CreditCard,
  payments: Receipt,
  checkIns: CheckCircle2,
};

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
  const [studentComplement, setStudentComplement] = useState('');
  const [studentDistrict, setStudentDistrict] = useState('');
  const [studentAddressNumber, setStudentAddressNumber] = useState('');
  const [isStudentActive, setIsStudentActive] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [fileFeedback, setFileFeedback] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [selectedStudentRelatedTable, setSelectedStudentRelatedTable] = useState('');
  const [studentRelatedRecords, setStudentRelatedRecords] = useState<CompanyChildRecord[]>([]);
  const [isLoadingStudentRelatedRecords, setIsLoadingStudentRelatedRecords] = useState(false);
  const [studentRelatedSearchTerm, setStudentRelatedSearchTerm] = useState('');
  const [selectedStudentRelatedRecordId, setSelectedStudentRelatedRecordId] = useState<number | null>(null);
  const [isCreatingStudentRelated, setIsCreatingStudentRelated] = useState(false);
  const [studentRelatedFormValues, setStudentRelatedFormValues] = useState<Record<string, string>>({});
  const [isStudentRelatedActive, setIsStudentRelatedActive] = useState(true);
  const [studentRelatedFeedback, setStudentRelatedFeedback] = useState('');
  const [studentRelatedLookups, setStudentRelatedLookups] = useState<Record<string, LookupRecord[]>>({});
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState('');
  const [studentErrors, setStudentErrors] = useState<StudentValidationErrors>({});
  const [touchedStudentFields, setTouchedStudentFields] = useState<
    Partial<Record<StudentValidationField, boolean>>
  >({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  type DrawerMode = 'student' | 'related' | 'files';
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('student');

  const isFormEnabled = selectedStudentId !== null || isCreating;
  const studentRelatedConfig =
    studentRelatedTables.find((table) => table.key === selectedStudentRelatedTable) ?? null;
  const isStudentRelatedFormEnabled =
    Boolean(selectedStudentId) &&
    studentRelatedConfig?.key !== 'files' &&
    (selectedStudentRelatedRecordId !== null || isCreatingStudentRelated);
  const filteredStudentRelatedRecords = studentRelatedRecords.filter((record) =>
    studentRelatedConfig
      ? studentRelatedConfig.columns.some((column) =>
        formatChildSearchValue(
          record,
          column,
          studentRelatedLookups[column.key],
        ).includes(studentRelatedSearchTerm.toLowerCase()),
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
        await getApiError(response, 'Não foi possível carregar os alunos.');
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
  }, [searchTerm, selectedStudentId]);

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
    setSelectedStudentRelatedRecordId(null);
    setIsCreatingStudentRelated(false);
    setStudentRelatedFormValues({});
    setIsStudentRelatedActive(true);
    setStudentRelatedFeedback('');
    void loadStudentRelatedRecords();
  }, [selectedStudentId, selectedStudentRelatedTable]);

  useEffect(() => {
    async function loadStudentRelatedLookups() {
      if (!studentRelatedConfig || studentRelatedConfig.key === 'files' || !selectedStudentId) {
        return;
      }

      const lookupFields = studentRelatedConfig.fields.filter((field) => field.lookupEndpoint);
      const nextLookups: Record<string, LookupRecord[]> = {};

      await Promise.all(
        lookupFields.map(async (field) => {
          if (!field.lookupEndpoint) {
            return;
          }

          const endpoint = field.lookupEndpoint.replace('{studentId}', String(selectedStudentId));
          const response = await fetch(`${apiUrl}/${endpoint}`);

          if (!response.ok) {
            await getApiError(response, `Não foi possível carregar ${field.label}.`);
          }

          nextLookups[field.key] = (await response.json()) as LookupRecord[];
        }),
      );

      setStudentRelatedLookups((current) => ({
        ...current,
        ...nextLookups,
      }));
    }

    void loadStudentRelatedLookups().catch((error) => {
      setStudentRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao carregar listas relacionadas.',
      );
    });
  }, [selectedStudentId, studentRelatedConfig]);

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
        await getApiError(response, 'Não foi possível carregar os arquivos do aluno.');
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
        await getApiError(response, 'Não foi possível carregar os registros relacionados.');
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
    setStudentComplement('');
    setStudentDistrict('');
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
    setSelectedStudentRelatedRecordId(null);
    setIsCreatingStudentRelated(false);
    setStudentRelatedFormValues({});
    setIsStudentRelatedActive(true);
    setStudentRelatedFeedback('');
    setIsCameraModalOpen(false);
    setIsCapturingPhoto(false);
    stopCameraStream();
    setIsDrawerOpen(false);

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
    setTimeout(() => nameInputRef.current?.focus(), 0);
    setDrawerMode('student');
    setIsDrawerOpen(true);
  }

  function handleSelectStudent(student: Student) {
    if (student.id === selectedStudentId) {
      clearForm();
      return;
    }

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
    setStudentComplement(student.anCoplemento);
    setStudentDistrict(student.anBairro);
    setStudentAddressNumber(
      student.nrEndereco === null ? '' : String(student.nrEndereco),
    );
    setIsStudentActive(student.boInativo === 0);
    setFeedback('');
    setFileFeedback('');
    setStudentErrors({});
    setTouchedStudentFields({});
  }

  function handleEditStudent(student: Student) {
    if (student.id !== selectedStudentId) handleSelectStudent(student);
    setDrawerMode('student');
    setIsDrawerOpen(true);
  }

  function handleSelectStudentRelatedTable(tableKey: string) {
    setSelectedStudentRelatedTable(tableKey);
    setFileFeedback('');
    setStudentRelatedFeedback('');
    setSelectedStudentRelatedRecordId(null);
    setIsCreatingStudentRelated(false);
    setStudentRelatedFormValues({});
    setIsStudentRelatedActive(true);

    if (tableKey !== 'files') {
      setIsCameraModalOpen(false);
      setIsCapturingPhoto(false);
      setCameraFeedback('');
      stopCameraStream();
    }
  }

  function clearStudentRelatedForm() {
    setSelectedStudentRelatedRecordId(null);
    setIsCreatingStudentRelated(false);
    setStudentRelatedFormValues({});
    setIsStudentRelatedActive(true);
    setStudentRelatedFeedback('');
  }

  function handleNewStudentRelated() {
    setSelectedStudentRelatedRecordId(null);
    setIsCreatingStudentRelated(true);
    setStudentRelatedFormValues(
      studentRelatedConfig?.fields.reduce<Record<string, string>>((current, field) => {
        if (field.key === 'nrDiaPagamento') {
          current[field.key] = '1';
        } else if (field.type === 'date') {
          current[field.key] = new Date().toISOString().slice(0, 10);
        }

        return current;
      }, {}) ?? {},
    );
    setIsStudentRelatedActive(true);
    setStudentRelatedFeedback('');

    if (studentRelatedConfig?.key === 'files') {
      setDrawerMode('files');
    } else {
      setDrawerMode('related');
    }

    setIsDrawerOpen(true);
  }

  function handleSelectStudentRelatedRecord(record: CompanyChildRecord) {
    if (!studentRelatedConfig || studentRelatedConfig.key === 'files') {
      return;
    }

    const values = studentRelatedConfig.fields.reduce<Record<string, string>>((current, field) => {
      const value = record[field.key];
      current[field.key] = field.type === 'date' ? formatDateInput(String(value ?? '')) : String(value ?? '');
      return current;
    }, {});

    setSelectedStudentRelatedRecordId(record.id);
    setIsCreatingStudentRelated(false);
    setStudentRelatedFormValues(values);
    setIsStudentRelatedActive(Number(record.boInativo ?? 0) === 0);
    setStudentRelatedFeedback('');
  }

  function handleEditStudentRelated(record: CompanyChildRecord) {
    if (record.id !== selectedStudentRelatedRecordId) handleSelectStudentRelatedRecord(record);
    setDrawerMode('related');
    setIsDrawerOpen(true);
  }

  function handleOpenFilesDrawer() {
    setDrawerMode('files');
    setIsDrawerOpen(true);
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
        await getApiError(response, 'Não foi possível alterar o status.');
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
        anCoplemento: studentComplement,
        anBairro: studentDistrict,
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

  async function handleToggleStudentRelatedStatus() {
    if (!studentRelatedConfig || studentRelatedConfig.key === 'files') {
      return;
    }

    const nextActive = !isStudentRelatedActive;
    setIsStudentRelatedActive(nextActive);

    if (!selectedStudentId || !selectedStudentRelatedRecordId) {
      return;
    }

    try {
      const response = await fetch(
        `${apiUrl}/students/${selectedStudentId}/related/${studentRelatedConfig.endpoint}/${selectedStudentRelatedRecordId}/status`,
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
        throw new Error(errorBody.message ?? 'Não foi possível alterar o status.');
      }

      const updatedRecord = (await response.json()) as CompanyChildRecord;
      setStudentRelatedRecords((current) =>
        current.map((record) => (record.id === updatedRecord.id ? updatedRecord : record)),
      );
    } catch (error) {
      setIsStudentRelatedActive(!nextActive);
      setStudentRelatedFeedback(error instanceof Error ? error.message : 'Erro ao alterar status.');
    }
  }

  async function handleSaveStudentRelated(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studentRelatedConfig || studentRelatedConfig.key === 'files') {
      setStudentRelatedFeedback('Selecione uma tabela relacionada antes de salvar.');
      return;
    }

    if (!selectedStudentId) {
      setStudentRelatedFeedback('Selecione um aluno antes de salvar.');
      return;
    }

    const missingRequiredField = studentRelatedConfig.fields.find(
      (field) => field.required && !studentRelatedFormValues[field.key],
    );

    if (missingRequiredField) {
      setStudentRelatedFeedback(`Informe ${missingRequiredField.label}.`);
      return;
    }

    try {
      const payload = studentRelatedConfig.fields.reduce<Record<string, string | number | null>>(
        (current, field) => {
          const value = studentRelatedFormValues[field.key] ?? '';
          current[field.key] = field.type === 'number' ? (value ? Number(value) : null) : value;
          return current;
        },
        {
          boInativo: isStudentRelatedActive ? 0 : 1,
        },
      );

      const response = await fetch(
        selectedStudentRelatedRecordId
          ? `${apiUrl}/students/${selectedStudentId}/related/${studentRelatedConfig.endpoint}/${selectedStudentRelatedRecordId}`
          : `${apiUrl}/students/${selectedStudentId}/related/${studentRelatedConfig.endpoint}`,
        {
          method: selectedStudentRelatedRecordId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = (await response.json()) as { message?: string };
        throw new Error(errorBody.message ?? 'Não foi possível salvar o registro relacionado.');
      }

      const savedRecord = (await response.json()) as CompanyChildRecord;
      await loadStudentRelatedRecords(selectedStudentId, studentRelatedConfig);
      setSelectedStudentRelatedRecordId(savedRecord.id);
      setIsCreatingStudentRelated(false);
      setStudentRelatedFeedback(`${studentRelatedConfig.label} salvo com sucesso.`);
      setIsDrawerOpen(false);
    } catch (error) {
      setStudentRelatedFeedback(
        error instanceof Error ? error.message : 'Erro ao salvar registro relacionado.',
      );
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
        throw new Error(errorBody.message ?? 'Não foi possível enviar o arquivo.');
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
      setFileFeedback('Câmera não suportada neste navegador.');
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
        setFileFeedback('Não foi possível acessar a câmera. Selecione um arquivo.');
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
        throw new Error('Não foi possível capturar a imagem.');
      }

      context.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (!blob) {
        throw new Error('Não foi possível capturar a imagem.');
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
        throw new Error(errorBody.message ?? 'Não foi possível abrir o arquivo.');
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
        throw new Error(errorBody.message ?? 'Não foi possível remover o arquivo.');
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
    <>
    <header className="module-page-header">
      <p className="section-label">Alunos</p>
      <h2 className="module-page-title">MATRÍCULAS</h2>
    </header>
    <div className="form-view">

      <div className={`activity-page-layout${selectedStudentId !== null ? ' has-related' : ''}`}>
        <section className="data-grid-section">
          <RegistrationGrid<Student>
            ariaLabel="Alunos cadastrados"
            columns={[
              { label: 'Aluno', render: (s) => s.nmAluno },
              { label: 'CPF', render: (s) => formatCpf(s.caCPF) },
              {
                label: 'Status', render: (s) => (
                  <span className={`status-badge ${s.boInativo === 0 ? 'active' : 'inactive'}`}>
                    {s.boInativo === 0 ? 'Ativo' : 'Inativo'}
                  </span>
                ),
              },
            ]}
            label="Alunos"
            onEdit={handleEditStudent}
            onNew={handleNewStudent}
            onPageChange={setStudentsPage}
            onSearch={setSearchTerm}
            onSelect={handleSelectStudent}
            page={studentsPage}
            records={paginatedStudents}
            searchPlaceholder="Buscar aluno"
            searchTerm={searchTerm}
            selectedId={selectedStudentId}
            totalItems={filteredStudents.length}
          />
        </section>

        {selectedStudentId !== null ? (
          <section className="data-grid-section">
            {studentRelatedConfig ? (
              <RegistrationGrid<CompanyChildRecord>
                ariaLabel={studentRelatedConfig.title}
                columns={studentRelatedConfig.columns.map((col) => ({
                  label: col.label,
                  render: (rec) => formatChildCell(rec, col, studentRelatedLookups[col.key]),
                }))}
                isLoading={isLoadingStudentRelatedRecords}
                label={studentRelatedConfig.label}
                newDisabled={!selectedStudentId}
                onNew={studentRelatedConfig.key === 'files' ? handleOpenFilesDrawer : handleNewStudentRelated}
                onSearch={setStudentRelatedSearchTerm}
                onSelect={studentRelatedConfig.key === 'files' ? () => {} : handleSelectStudentRelatedRecord}
                onEdit={studentRelatedConfig.key !== 'files' ? handleEditStudentRelated : undefined}
                records={filteredStudentRelatedRecords}
                rowSelectable={studentRelatedConfig.key !== 'files'}
                searchTerm={studentRelatedSearchTerm}
                selectedId={selectedStudentRelatedRecordId}
                showNewButton={true}
                variant="child"
              />
            ) : (
              <div className="form-hint">Selecione uma aba para ver os registros.</div>
            )}
          </section>
        ) : null}

        {selectedStudentId !== null ? (
          <RegistrationTabs
            tabs={studentRelatedTables}
            activeTab={selectedStudentRelatedTable}
            onTabChange={handleSelectStudentRelatedTable}
            icons={studentTabIcons}
            ariaLabel="Tabelas relacionadas do aluno"
          />
        ) : null}

        <RegistrationDrawer
          isOpen={isDrawerOpen}
          title={drawerMode === 'student' ? (isCreating ? 'Novo Aluno' : 'Editar Aluno') : drawerMode === 'files' ? 'Arquivos do Aluno' : (studentRelatedConfig?.label ?? 'Registro relacionado')}
          onClose={() => setIsDrawerOpen(false)}
        >
          {drawerMode === 'student' ? (
            <form className="drawer-fields" onSubmit={handleSaveStudent}>
              {feedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{feedback}</div> : null}
              {/* Nome */}
              <RegistrationField error={studentErrors.name} htmlFor="nmAluno" label="Nome" required size="full" touched={touchedStudentFields.name}>
                <input className={touchedStudentFields.name && studentErrors.name ? 'invalid' : ''} id="nmAluno" maxLength={255} onBlur={() => validateStudentField('name')} onChange={(event) => { const value = event.target.value; setStudentName(value); if (touchedStudentFields.name) { setStudentErrors((current) => ({ ...current, name: value.trim() ? undefined : 'Informe o nome do aluno.' })); } }} placeholder="Ex.: Maria Souza" ref={nameInputRef} type="text" value={studentName} />
              </RegistrationField>
              {/* CPF */}
              <RegistrationField error={studentErrors.cpf} htmlFor="caCPF" label="CPF" required size="md" touched={touchedStudentFields.cpf}>
                <input className={touchedStudentFields.cpf && studentErrors.cpf ? 'invalid' : ''} id="caCPF" maxLength={14} onBlur={() => validateStudentField('cpf')} onChange={(event) => { const formattedCpf = formatCpf(event.target.value); setStudentCpf(formattedCpf); if (touchedStudentFields.cpf) { setStudentErrors((current) => ({ ...current, cpf: isValidCpf(formattedCpf) ? undefined : 'Informe um CPF válido.' })); } }} placeholder="000.000.000-00" ref={cpfInputRef} type="text" value={studentCpf} />
              </RegistrationField>
              {/* Nascimento */}
              <RegistrationField error={studentErrors.birthDate} htmlFor="dtNascimento" label="Data de nascimento" required size="sm" touched={touchedStudentFields.birthDate}>
                <input className={touchedStudentFields.birthDate && studentErrors.birthDate ? 'invalid' : ''} id="dtNascimento" max={new Date().toISOString().slice(0, 10)} onBlur={() => validateStudentField('birthDate')} onChange={(event) => { const value = event.target.value; setStudentBirthDate(value); if (touchedStudentFields.birthDate) { setStudentErrors((current) => ({ ...current, birthDate: isValidBirthDate(value) ? undefined : 'Informe uma data de nascimento valida.' })); } }} ref={birthDateInputRef} type="date" value={studentBirthDate} />
              </RegistrationField>
              {/* DDD */}
              <RegistrationField htmlFor="nrDDD" label="DDD" size="xs">
                <input id="nrDDD" maxLength={2} onChange={(event) => setStudentDdd(event.target.value)} placeholder="11" type="text" value={studentDdd} />
              </RegistrationField>
              {/* Telefone */}
              <RegistrationField htmlFor="nrContato" label="Telefone" size="sm">
                <input id="nrContato" maxLength={10} onChange={(event) => setStudentPhone(formatPhone(event.target.value))} placeholder="00000-0000" type="text" value={studentPhone} />
              </RegistrationField>
              {/* Email */}
              <RegistrationField error={studentErrors.email} htmlFor="anEmail" label="Email" size="lg" touched={touchedStudentFields.email}>
                <input className={touchedStudentFields.email && studentErrors.email ? 'invalid' : ''} id="anEmail" maxLength={100} onBlur={() => validateStudentField('email')} onChange={(event) => { const value = event.target.value; setStudentEmail(value); if (touchedStudentFields.email) { const trimmedEmail = value.trim(); setStudentErrors((current) => ({ ...current, email: trimmedEmail && !isValidEmail(trimmedEmail) ? 'Informe um email válido.' : undefined })); } }} placeholder="aluno@email.com" ref={emailInputRef} type="email" value={studentEmail} />
              </RegistrationField>
              {/* Endereço */}
              <RegistrationField htmlFor="anLogradouro" label="Logradouro" size="full">
                <input id="anLogradouro" maxLength={100} onChange={(event) => setStudentAddress(event.target.value)} placeholder="Rua, avenida..." type="text" value={studentAddress} />
              </RegistrationField>
              <RegistrationField htmlFor="anBairro" label="Bairro" size="md">
                <input id="anBairro" maxLength={100} onChange={(event) => setStudentDistrict(event.target.value)} placeholder="Bairro" type="text" value={studentDistrict} />
              </RegistrationField>
              <RegistrationField htmlFor="anCoplemento" label="Complemento" size="md">
                <input id="anCoplemento" maxLength={100} onChange={(event) => setStudentComplement(event.target.value)} placeholder="Apt, bloco..." type="text" value={studentComplement} />
              </RegistrationField>
              <RegistrationField htmlFor="anCEP" label="CEP" size="sm">
                <input id="anCEP" maxLength={8} onChange={(event) => setStudentCep(event.target.value)} placeholder="Somente numeros" type="text" value={studentCep} />
              </RegistrationField>
              <RegistrationField htmlFor="nrEndereco" label="Número" size="xs">
                <input id="nrEndereco" onChange={(event) => setStudentAddressNumber(event.target.value)} placeholder="0" type="number" value={studentAddressNumber} />
              </RegistrationField>
              {/* Status */}
              <RegistrationField htmlFor="studentStatus" label="Status" size="sm">
                <button aria-pressed={isStudentActive} className={`status-toggle ${isStudentActive ? 'active' : ''}`} id="studentStatus" onClick={handleToggleStatus} type="button">
                  <span>{isStudentActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                <button type="submit"><Save size={16} />Salvar aluno</button>
              </div>
            </form>
          ) : drawerMode === 'files' ? (
            <div className="drawer-fields">
              {fileFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{fileFeedback}</div> : null}
              <RegistrationField htmlFor="studentFile" label="Selecionar arquivo" size="full">
                <div className="file-upload-controls">
                  <input disabled={!selectedStudentId || isUploadingFile} id="studentFile" onChange={(event) => void handleUploadStudentFile(event.target.files?.[0] ?? null)} ref={fileInputRef} type="file" />
                  <button className="secondary-button" disabled={!selectedStudentId || isUploadingFile} onClick={handleOpenCameraCapture} type="button">Tirar foto</button>
                </div>
                <input accept="image/*" capture="environment" className="camera-capture-input" disabled={!selectedStudentId || isUploadingFile} onChange={(event) => void handleUploadStudentFile(event.target.files?.[0] ?? null)} ref={cameraInputRef} type="file" />
              </RegistrationField>
              {isCameraModalOpen ? (
                <div className="camera-modal-overlay" role="dialog" aria-modal="true">
                  <div className="camera-modal">
                    <h4>Capturar foto</h4>
                    <video autoPlay className="camera-live-preview" muted playsInline ref={cameraVideoRef} />
                    {cameraFeedback ? <p className="camera-modal-feedback">{cameraFeedback}</p> : null}
                    <div className="camera-modal-actions">
                      <button className="secondary-button" onClick={handleCloseCameraCapture} type="button">Cancelar</button>
                      <button disabled={isCapturingPhoto || isUploadingFile} onClick={() => void handleCaptureCameraPhoto()} type="button">{isCapturingPhoto ? 'Capturando...' : 'Capturar'}</button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="student-files-list" style={{ flex: '1 1 100%' }}>
                {studentFiles.map((file) => (
                  <div className="student-file-row" key={file.id}>
                    {previewUrls[file.id] ? <img alt={file.anCaminho.split('/').pop()} className="student-file-preview" src={previewUrls[file.id]} /> : null}
                    <div className="student-file-row-info">
                      <strong>{file.anCaminho.split('/').pop()}</strong>
                      <span>{file.anCaminho}</span>
                    </div>
                    <div className="student-file-actions">
                      <button className="secondary-button" onClick={() => void handleOpenStudentFile(file.id)} type="button">Abrir</button>
                      <button className="secondary-button danger" onClick={() => void handleRemoveStudentFile(file.id)} type="button">Remover</button>
                    </div>
                  </div>
                ))}
                {selectedStudentId && studentFiles.length === 0 ? <div className="empty-row">Nenhum arquivo anexado.</div> : null}
              </div>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Fechar</button>
              </div>
            </div>
          ) : studentRelatedConfig ? (
            <form className="drawer-fields" onSubmit={handleSaveStudentRelated}>
              {studentRelatedFeedback ? <div className="form-feedback" style={{ flex: '1 1 100%' }}>{studentRelatedFeedback}</div> : null}
              {studentRelatedConfig.fields.map((field) => (
                <RegistrationField htmlFor={`studentRelated-${field.key}`} key={field.key} label={field.label} required={field.required} size="full">
                  {field.lookupEndpoint ? (
                    <select disabled={!isStudentRelatedFormEnabled} id={`studentRelated-${field.key}`} onChange={(event) => setStudentRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} value={studentRelatedFormValues[field.key] ?? ''}>
                      <option value="">Selecione</option>
                      {(studentRelatedLookups[field.key] ?? []).map((option) => (<option key={option.id} value={option.id}>{getLookupLabel(option, field)}</option>))}
                    </select>
                  ) : (
                    <input disabled={!isStudentRelatedFormEnabled} id={`studentRelated-${field.key}`} onChange={(event) => setStudentRelatedFormValues((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} type={field.type} value={studentRelatedFormValues[field.key] ?? ''} />
                  )}
                </RegistrationField>
              ))}
              <RegistrationField htmlFor="studentRelatedStatus" label="Status" size="sm">
                <button aria-pressed={isStudentRelatedActive} className={`status-toggle ${isStudentRelatedActive ? 'active' : ''}`} disabled={!isStudentRelatedFormEnabled} id="studentRelatedStatus" onClick={handleToggleStudentRelatedStatus} type="button">
                  <span>{isStudentRelatedActive ? 'Ativo' : 'Inativo'}</span>
                </button>
              </RegistrationField>
              <div className="form-actions" style={{ flex: '1 1 100%' }}>
                <button className="secondary-button" onClick={() => setIsDrawerOpen(false)} type="button">Cancelar</button>
                <button disabled={!isStudentRelatedFormEnabled} type="submit"><Save size={16} />Salvar {studentRelatedConfig.label}</button>
              </div>
            </form>
          ) : null}
        </RegistrationDrawer>
      </div>
    </div>
    </>
  );
}
