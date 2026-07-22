-- Revogacao de JWT: versao de sessao por usuario. Logout e redefinicao de senha
-- incrementam esta coluna; o plugin de auth compara o claim `tv` do token com o
-- valor vigente a cada request, derrubando tokens emitidos antes do incremento.
ALTER TABLE "tb_Usuarios" ADD COLUMN "nrTokenVersion" INTEGER NOT NULL DEFAULT 0;
