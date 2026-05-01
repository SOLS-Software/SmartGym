-- CreateTable
CREATE TABLE "tb_Funcionarios" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "nmFuncionario" VARCHAR(255) NOT NULL DEFAULT '',
    "caCPF" VARCHAR(11) NOT NULL DEFAULT '',
    "dtNascimento" DATE,
    "nrDDD" INTEGER NOT NULL DEFAULT 0,
    "nrContato" INTEGER NOT NULL DEFAULT 0,
    "anEmail" VARCHAR(100) NOT NULL DEFAULT '',
    "cnCargoTP" INTEGER NOT NULL DEFAULT 0,
    "dtAdmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Usuarios" (
    "id" SERIAL NOT NULL,
    "idFuncionario" INTEGER,
    "idAluno" INTEGER,
    "dsLogin" VARCHAR(100) NOT NULL DEFAULT '',
    "dtUltimoAcesso" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Senhas" (
    "id" SERIAL NOT NULL,
    "idUsuario" INTEGER,
    "dsSenha" VARCHAR(255),
    "cnTipoHash" INTEGER,
    "dtExpiracao" TIMESTAMP(3),
    "boTrocaObrigatoria" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Senhas_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tb_Funcionarios" ADD CONSTRAINT "tb_Funcionarios_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Usuarios" ADD CONSTRAINT "tb_Usuarios_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Usuarios" ADD CONSTRAINT "tb_Usuarios_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Senhas" ADD CONSTRAINT "tb_Senhas_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "tb_Usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
