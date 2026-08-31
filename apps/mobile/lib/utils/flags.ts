// Leitura dos indicadores `boInativo` que vêm da API.
//
// POR QUE ISTO EXISTE: as telas comparavam `boInativo === 0`, mas a API devolve
// booleano (`false`). Como os tipos do app declaravam `number`, o TypeScript
// nunca reclamou — e `false === 0` é falso, então TODO registro caía fora do
// filtro. Meu Treino e a lista de treinos do Perfil apareciam vazias para
// alunos que tinham treino ativo, sem erro nenhum na tela.
//
// Aceita as duas formas de propósito: rotas antigas ainda podem devolver 0/1, e
// uma tela vazia por causa de formato é justamente o que não se percebe.
export function estaAtivo(boInativo: boolean | number | null | undefined): boolean {
  return boInativo === false || boInativo === 0 || boInativo === null || boInativo === undefined;
}
