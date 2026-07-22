-- Login/register-lookup/forgot-password buscam por CPF sem o tenant no filtro;
-- os uniques compostos (idCliente/idEmpresa como coluna lider) nao cobrem esse
-- padrao de acesso.

-- CreateIndex
CREATE INDEX "tb_Alunos_caCPF_idx" ON "tb_Alunos"("caCPF");

-- CreateIndex
CREATE INDEX "tb_Funcionarios_caCPF_idx" ON "tb_Funcionarios"("caCPF");
