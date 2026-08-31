-- Separa presenca real (catraca/recepcao) de sessao aberta pelo proprio aluno
-- no app. Sem esta coluna, liberar o botao "iniciar treino" para o aluno
-- transformaria frequencia, evasao e fidelidade em algo que ele controla
-- sozinho, de qualquer lugar.
--
-- Default true: toda linha que existe hoje nasceu na porta.
ALTER TABLE "tb_AlunoCheckIns" ADD COLUMN "boPresencial" BOOLEAN NOT NULL DEFAULT true;
