-- Chave de login na identidade CENTRAL — a ultima porta do multi-tenancy.
--
-- O PROBLEMA
-- O login procura a pessoa assim:
--   usuario.findMany({ OR: [ { aluno: { caCPFHash } }, { funcionario: { caCPFHash } } ] })
-- tb_Usuarios e control-plane, mas o FILTRO atravessa para tb_Alunos e
-- tb_Funcionarios, que sao de APLICACAO. Com banco por cliente esse JOIN deixa
-- de existir: para achar o CPF seria preciso ja saber em qual banco procurar —
-- e quem esta tentando entrar ainda nao disse de qual academia e. O app mobile
-- nem dominio manda.
--
-- A SAIDA (o item "identidade enxuta central" do desenho)
-- A CHAVE DE LOGIN passa a viver na identidade central, junto com o hash da
-- senha que ela ja guarda. O perfil rico (nome, contato, endereco) e o RBAC
-- continuam sendo dado do cliente, carregados DEPOIS, do banco dele.
--
-- NAO E UNIQUE, de proposito:
--   - o mesmo CPF pode ter conta em academias diferentes (tb_Alunos e
--     @@unique([idCliente, caCPFHash]) — a mesma pessoa treina em duas);
--   - e pode ser aluno E funcionario na mesma academia, o que sao duas linhas
--     aqui com o mesmo par (idCliente, caCPFHash).
-- O desempate de qual conta e, quando ha mais de uma, continua sendo a SENHA —
-- como ja era desde o achado A-2.
--
-- DUPLICACAO E SINCRONISMO: sim, o hash passa a existir em dois lugares. Nao
-- da para evitar — o login precisa dele antes de saber o banco. Os pontos de
-- escrita sao poucos e estao todos em codigo: criacao do usuario
-- (/auth/register) e alteracao de CPF na ficha (PUT de aluno e de funcionario),
-- via shared/loginKey.ts. A ordem la e ficha primeiro, chave depois: se a
-- segunda falhar, o login continua valendo pelo CPF antigo — recuperavel — em
-- vez de a pessoa ficar sem entrar.

ALTER TABLE "tb_Usuarios" ADD COLUMN IF NOT EXISTS "caCPFHash" varchar(64);

-- Backfill a partir do perfil, que hoje e a fonte.
UPDATE "tb_Usuarios" u
SET "caCPFHash" = a."caCPFHash"
FROM "tb_Alunos" a
WHERE a."id" = u."idAluno" AND u."caCPFHash" IS NULL;

UPDATE "tb_Usuarios" u
SET "caCPFHash" = f."caCPFHash"
FROM "tb_Funcionarios" f
WHERE f."id" = u."idFuncionario" AND u."caCPFHash" IS NULL;

-- E o caminho quente do login: um indice, nao uma varredura.
CREATE INDEX IF NOT EXISTS "tb_Usuarios_caCPFHash_idx" ON "tb_Usuarios" ("caCPFHash");

-- Rollback: DROP INDEX "tb_Usuarios_caCPFHash_idx";
--           ALTER TABLE "tb_Usuarios" DROP COLUMN "caCPFHash";
