// Carrega os scripts do background com `browser` e `fetch` falsos e um Google Agenda em memória.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));

// Dados no formato que o content script extrai do Portal do Discente.
const DADOS = {
  lidoEm: 0,
  turmas: [
    { idTurma: '1001', nome: 'CÁLCULO I', local: 'SALA A1', horario: '4T12' },
    { idTurma: '1002', nome: 'ESTRUTURAS DE DADOS', local: 'SALA B2', horario: '35T56' },
    { idTurma: '1003', nome: 'BANCO DE DADOS', local: 'SALA B3', horario: '6T56' },
  ],
  atividades: [
    { chave: 'tarefa-501', idTurma: '1001', disciplina: 'CÁLCULO I', tipo: 'Tarefa', titulo: 'Lista 1', prazo: '2026-10-07T23:59' },
    { chave: 'tarefa-502', idTurma: '1002', disciplina: 'ESTRUTURAS DE DADOS', tipo: 'Tarefa', titulo: 'Relatório', prazo: '2026-10-13T23:59' },
    { chave: 'tarefa-503', idTurma: '1003', disciplina: 'BANCO DE DADOS', tipo: 'Tarefa', titulo: 'Projeto', prazo: '2026-10-16T23:59' },
    { chave: 'tarefa-9', idTurma: null, disciplina: 'DISCIPLINA SEM TURMA', tipo: 'Tarefa', titulo: 'Sem horário', prazo: '2026-10-20T23:59' },
  ],
};

function criarAmbiente({ agora = '2026-10-13T12:00:00-03:00' } = {}) {
  const armazenamento = {
    config: { clientId: 'id', clientSecret: 'segredo', calendarId: 'primary', incluirVencidas: false },
    auth: { refreshToken: 'rt', accessToken: 'at', expiraEm: Date.parse(agora) + 3600_000 },
  };
  const agenda = new Map();
  let proximoId = 1;
  let ouvinte;

  const browser = {
    storage: {
      local: {
        async get(chaves) {
          const lista = typeof chaves === 'string' ? [chaves] : chaves;
          return Object.fromEntries(lista.filter((c) => c in armazenamento).map((c) => [c, structuredClone(armazenamento[c])]));
        },
        async set(valores) { Object.assign(armazenamento, structuredClone(valores)); },
        async remove(chave) { delete armazenamento[chave]; },
      },
    },
    runtime: { onMessage: { addListener: (fn) => { ouvinte = fn; } } },
    browserAction: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    identity: { getRedirectURL: () => 'https://x.extensions.allizom.org/' },
  };

  async function fetch(url, opcoes = {}) {
    const u = new URL(url);
    const responder = (status, corpo) => ({ ok: status < 400, status, statusText: '', json: async () => corpo });
    assert.equal(opcoes.headers?.Authorization, 'Bearer at');
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET' && u.pathname.endsWith('/events')) {
      const [chave, valor] = u.searchParams.get('privateExtendedProperty').split('=');
      const items = [...agenda.values()].filter((e) => e.extendedProperties?.private?.[chave] === valor);
      return responder(200, { items: structuredClone(items) });
    }
    if (metodo === 'POST' && u.pathname.endsWith('/events')) {
      const evento = { ...JSON.parse(opcoes.body), id: `ev${proximoId++}` };
      agenda.set(evento.id, evento);
      return responder(200, evento);
    }
    if (metodo === 'PATCH') {
      const id = decodeURIComponent(u.pathname.split('/').pop());
      const alteracoes = JSON.parse(opcoes.body);
      const atual = agenda.get(id);
      const mesclar = (a, b) => Object.fromEntries(
        Object.entries({ ...a, ...b }).filter(([, v]) => v !== null),
      );
      agenda.set(id, { ...atual, ...alteracoes, start: mesclar(atual.start, alteracoes.start), end: mesclar(atual.end, alteracoes.end) });
      return responder(200, agenda.get(id));
    }
    throw new Error(`requisição inesperada: ${metodo} ${url}`);
  }

  const RealDate = Date;
  class DataFixa extends RealDate {
    constructor(...args) { super(...(args.length ? args : [agora])); }
    static now() { return RealDate.parse(agora); }
  }

  const contexto = vm.createContext({
    browser, fetch, Date: DataFixa, URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto,
    btoa, console, structuredClone,
  });
  for (const script of manifesto.background.scripts) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, script), 'utf8'), contexto, { filename: script });
  }

  return {
    agenda,
    armazenamento,
    enviar: (mensagem) => ouvinte(structuredClone(mensagem)),
  };
}

test('cria eventos no horário da turma, na data de entrega', async () => {
  const amb = criarAmbiente();
  const r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  assert.equal(r.ok, true);

  const porChave = Object.fromEntries(r.itens.map((i) => [i.chave, i]));
  assert.equal(porChave['tarefa-501'].status, 'ignorado'); // 07/10 já passou
  assert.equal(porChave['tarefa-502'].status, 'criado');
  assert.equal(porChave['tarefa-503'].status, 'criado');
  assert.equal(porChave['tarefa-9'].status, 'criado');

  const eventos = [...amb.agenda.values()];
  const projeto = eventos.find((e) => e.extendedProperties.private.sigaaId === 'tarefa-503');
  assert.equal(projeto.start.dateTime, '2026-10-16T16:40:00-03:00'); // sexta, 6T56
  assert.equal(projeto.end.dateTime, '2026-10-16T18:20:00-03:00');
  assert.equal(projeto.summary, 'Tarefa: Projeto — BANCO DE DADOS');
  assert.equal(projeto.location, 'SALA B3');

  const estruturas = eventos.find((e) => e.extendedProperties.private.sigaaId === 'tarefa-502');
  assert.equal(estruturas.start.dateTime, '2026-10-13T16:40:00-03:00'); // terça, 35T56

  const semTurma = eventos.find((e) => e.extendedProperties.private.sigaaId === 'tarefa-9');
  assert.deepEqual(semTurma.start, { date: '2026-10-20' }); // dia inteiro
  assert.deepEqual(semTurma.end, { date: '2026-10-21' });
});

test('não duplica: segunda visita encontra os eventos já criados', async () => {
  const amb = criarAmbiente();
  await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  const r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  assert.equal(amb.agenda.size, 3);
  assert.deepEqual(
    [...r.itens.map((i) => i.status)], // copia para o realm do teste (o array vem do vm)
    ['ignorado', 'existente', 'existente', 'existente'],
  );
});

test('prazo alterado no SIGAA atualiza o evento existente', async () => {
  const amb = criarAmbiente();
  await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  const alterado = structuredClone(DADOS);
  alterado.atividades[2].prazo = '2026-10-23T23:59';
  const r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: alterado });
  assert.equal(r.itens[2].status, 'atualizado');
  assert.equal(amb.agenda.size, 3);
  const evento = [...amb.agenda.values()].find((e) => e.extendedProperties.private.sigaaId === 'tarefa-503');
  assert.equal(evento.start.dateTime, '2026-10-23T16:40:00-03:00');
  assert.equal(evento.extendedProperties.private.sigaaPrazo, '2026-10-23T23:59');
});

test('evento apagado da agenda não é recriado, a não ser que o usuário peça', async () => {
  const amb = criarAmbiente();
  await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  const id = [...amb.agenda.values()].find((e) => e.extendedProperties.private.sigaaId === 'tarefa-503').id;
  amb.agenda.delete(id);

  let r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  assert.equal(r.itens[2].status, 'ignorado');
  assert.equal(amb.agenda.size, 2);

  await amb.enviar({ tipo: 'ESQUECER_APAGADOS' });
  r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  assert.equal(r.itens[2].status, 'criado');
  assert.equal(amb.agenda.size, 3);
});

test('incluirVencidas cria também as atividades com prazo passado', async () => {
  const amb = criarAmbiente();
  amb.armazenamento.config.incluirVencidas = true;
  const r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  assert.equal(r.itens[0].status, 'criado');
  assert.equal(amb.agenda.size, 4);
});

test('sem conta conectada, avisa para conectar e não chama a API', async () => {
  const amb = criarAmbiente();
  delete amb.armazenamento.auth;
  const r = await amb.enviar({ tipo: 'DADOS_SIGAA', dados: DADOS });
  assert.equal(r.ok, false);
  assert.equal(r.precisaConectar, true);
  assert.equal(amb.agenda.size, 0);
});
