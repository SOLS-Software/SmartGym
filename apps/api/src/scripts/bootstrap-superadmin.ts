// Cria o PRIMEIRO acesso de uma instalação nova: o cliente da operação interna
// (SOLS) e um usuário super-admin nele.
//
//   # prévia — não grava nada
//   tsx apps/api/src/scripts/bootstrap-superadmin.ts
//
//   # grava
//   BOOTSTRAP_LOGIN="voce@solssoftwares.com.br" \
//   BOOTSTRAP_SENHA="<senha forte>" \
//     tsx apps/api/src/scripts/bootstrap-superadmin.ts --apply
//
// ---------------------------------------------------------------------------
// Por que este script precisa existir
// ---------------------------------------------------------------------------
// Um banco recém-migrado não tem como receber o primeiro usuário pela API. O
// plugin de auth (plugins/auth.ts) busca `usuario.findUnique({ id: sub })` a
// cada request e recusa com `conta_inexistente` se não achar — então um token
// assinado à mão também não entra. E `Usuario.idCliente` é obrigatório, logo
// nem o super-admin da SOLS existe antes de existir um Cliente.
//
// Ou seja: a primeira escrita é necessariamente direta no banco. Daí em diante
// tudo passa pela API, com as regras de negócio valendo.
//
// O que este script NÃO faz: criar a academia do piloto. Isso é
// `POST /clients` pela API, autenticado com o super-admin que nasce aqui — o
// caminho correto, que aplica validação, auditoria e unicidade de CNPJ.
//
// Seguro de repetir: se o cliente ou o login já existirem, ele atualiza em vez
// de duplicar (e a senha só é regravada quando BOOTSTRAP_SENHA vem definida).

import { HASH_TYPE_BCRYPT, hashPassword } from '../shared/passwords.js';
import { prisma } from '../shared/prisma.js';

const APLICAR = process.argv.includes('--apply');

const NOME_CLIENTE = process.env.BOOTSTRAP_CLIENTE ?? 'SOLS Softwares';
const LOGIN = process.env.BOOTSTRAP_LOGIN ?? '';
const SENHA = process.env.BOOTSTRAP_SENHA ?? '';

function abortar(mensagem: string): never {
  console.error(`ERRO: ${mensagem}`);
  process.exit(1);
}

async function main() {
  console.log(APLICAR ? '>> APLICANDO\n' : '>> DRY-RUN (use --apply para gravar)\n');

  if (!LOGIN) abortar('defina BOOTSTRAP_LOGIN com o e-mail do super-admin.');
  if (APLICAR && SENHA.length < 12) {
    abortar('defina BOOTSTRAP_SENHA com pelo menos 12 caracteres.');
  }

  // O host do banco alvo é impresso antes de qualquer escrita, na mesma
  // convenção dos scripts de demo: é a única linha que separa "semeei o
  // servidor novo" de "semeei a produção de alguém".
  const alvo = (process.env.DATABASE_URL ?? '').replace(/:\/\/[^@]*@/, '://***@');
  console.log(`banco alvo : ${alvo || '(DATABASE_URL não definida)'}`);
  console.log(`cliente    : ${NOME_CLIENTE}`);
  console.log(`login      : ${LOGIN}\n`);

  const clienteExistente = await prisma.cliente.findFirst({
    where: { dsCliente: NOME_CLIENTE },
    select: { id: true },
  });

  const usuarioExistente = clienteExistente
    ? await prisma.usuario.findFirst({
        where: { idCliente: clienteExistente.id, dsLogin: LOGIN },
        select: { id: true, boSuperAdmin: true },
      })
    : null;

  console.log(`cliente  ${clienteExistente ? `já existe (id ${clienteExistente.id})` : 'será criado'}`);
  console.log(`usuário  ${usuarioExistente ? `já existe (id ${usuarioExistente.id})` : 'será criado'}`);
  console.log(`senha    ${SENHA ? 'será gravada' : 'não informada — mantida como está'}`);

  if (!APLICAR) {
    console.log('\nNada gravado. Repita com --apply.');
    return;
  }

  // O bcrypt roda ANTES da transação, de propósito: ele é deliberadamente lento
  // (centenas de ms), e segurar uma transação aberta durante um custo de CPU
  // que não depende do banco é desperdício de conexão e de lock.
  const hash = SENHA ? await hashPassword(SENHA) : null;

  // Tudo numa transação: um super-admin sem senha, ou uma senha órfã, deixaria
  // a instalação num estado pior que o inicial — sem acesso e sem como repetir
  // o script de forma limpa.
  const resultado = await prisma.$transaction(async (tx) => {
    const cliente =
      clienteExistente ??
      (await tx.cliente.create({
        data: { dsCliente: NOME_CLIENTE },
        select: { id: true },
      }));

    const usuario =
      usuarioExistente ??
      (await tx.usuario.create({
        data: {
          idCliente: cliente.id,
          dsLogin: LOGIN,
          boSuperAdmin: true,
        },
        select: { id: true, boSuperAdmin: true },
      }));

    // Um usuário pré-existente pode ter sido criado sem a marca; garante.
    if (!usuario.boSuperAdmin) {
      await tx.usuario.update({ where: { id: usuario.id }, data: { boSuperAdmin: true } });
    }

    if (hash) {
      // Desativa senhas anteriores em vez de apagar: o histórico de credencial
      // é trilha de auditoria, e `verifyPassword` só considera as ativas.
      await tx.senha.updateMany({
        where: { idUsuario: usuario.id, boInativo: false },
        data: { boInativo: true },
      });
      await tx.senha.create({
        data: {
          idUsuario: usuario.id,
          dsSenha: hash,
          cnTipoHash: HASH_TYPE_BCRYPT,
        },
      });
    }

    return { idCliente: cliente.id, idUsuario: usuario.id };
  });

  console.log(`\nPronto. Cliente ${resultado.idCliente}, usuário ${resultado.idUsuario}.`);
  console.log('Entre pelo painel e crie a academia do piloto por POST /clients.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
