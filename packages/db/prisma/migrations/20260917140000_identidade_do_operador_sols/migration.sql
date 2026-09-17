-- Identidade de quem administra a PLATAFORMA (SOLS), separada da identidade de
-- quem usa uma academia.
--
-- O PROBLEMA
-- Hoje o "super admin" da SOLS e uma linha de tb_Usuarios com boSuperAdmin=true.
-- Duas consequencias, as duas ruins:
--
--   1. tb_Usuarios.idCliente e NOT NULL com FK para tb_Clientes. Ou seja: quem
--      administra TODAS as academias precisa pertencer a UMA delas para poder
--      existir. E uma mentira no modelo, e ela vaza para todo lugar que
--      pergunta "de qual cliente e este usuario?".
--
--   2. No hook de auth (apps/api/src/plugins/auth.ts), boSuperAdmin PULA a
--      checagem de RBAC inteira. O mesmo token que entra no painel de um
--      cliente administra a plataforma. Uma falha de autorizacao deixa de
--      vazar uma academia e passa a vazar o negocio inteiro.
--
-- A SAIDA
-- O painel do provedor vive em outra aplicacao (repositorio separado), com
-- segredo de sessao proprio e esta tabela como identidade. Um token de la nao
-- abre nada aqui; um token daqui nao abre nada la.
--
-- Esta tabela e CONTROL-PLANE: classificada em apps/api/src/shared/tenantTables.ts,
-- continua no banco central depois que os clientes forem siloados. Ela teria de
-- continuar de qualquer forma — nao pertence a academia nenhuma.
--
-- POR QUE O HASH FICA AQUI e nao numa tb_Senhas propria: aquela tabela existe
-- para carregar formato de hash legado (SHA-256 sem salt, do sistema antigo) e
-- troca obrigatoria de senha. Aqui nao ha legado; a primeira senha ja nasce
-- bcrypt, e uma tabela a mais so adicionaria um JOIN a cada login.
--
-- NAO REMOVE boSuperAdmin. A coluna continua valendo enquanto o painel nao
-- estiver de pe — derrubar os dois no mesmo passo deixaria a plataforma sem
-- nenhuma forma de administracao no intervalo. A remocao e uma migration
-- separada, depois que o primeiro operador entrar pelo painel novo.

CREATE TABLE "tb_OperadoresSols" (
    "id" SERIAL NOT NULL,
    "dsNome" VARCHAR(255) NOT NULL,
    "anEmail" VARCHAR(255) NOT NULL,
    "dsSenha" VARCHAR(255) NOT NULL,
    -- 'dono' | 'suporte'. Existe desde o inicio porque o motivo de o painel ser
    -- separado E o dia em que houver uma segunda pessoa: quem da suporte
    -- precisa ver um cliente sem poder mexer no contrato dele.
    "cnPapel" VARCHAR(20) NOT NULL DEFAULT 'dono',
    -- Revogacao de sessao: o token carrega o valor vigente na emissao, e sair
    -- ou trocar a senha incrementa a coluna, derrubando qualquer sessao viva.
    "nrTokenVersion" INTEGER NOT NULL DEFAULT 0,
    "dtUltimoAcesso" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_OperadoresSols_pkey" PRIMARY KEY ("id")
);

-- E a chave de login. UNIQUE aqui, ao contrario de tb_Usuarios.caCPFHash, que
-- nao pode ser: la a mesma pessoa pode ter conta em academias diferentes. Aqui
-- so existe uma SOLS, entao um e-mail e uma conta.
CREATE UNIQUE INDEX "tb_OperadoresSols_anEmail_key" ON "tb_OperadoresSols"("anEmail");
