// Recebe as atividades lidas do SIGAA e garante que cada uma tenha um evento no Google Agenda.
//
// Cada evento criado leva em extendedProperties.private:
//   sigaaOrigem = 'sigaa-ufrn'      -> permite listar só os eventos da extensão
//   sigaaId     = chave da atividade -> diz se a atividade já está na agenda
//   sigaaPrazo  = prazo no SIGAA     -> detecta quando o professor muda a data

const ORIGEM = 'sigaa-ufrn';
const FUSO = 'America/Fortaleza';
const OFFSET = '-03:00';

// Evita sincronizações simultâneas (ex.: duas abas do SIGAA abertas ao mesmo tempo).
let fila = Promise.resolve();
function enfileirar(tarefa) {
  const resultado = fila.then(tarefa, tarefa);
  fila = resultado.catch(() => {});
  return resultado;
}

function normalizar(texto) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function encontrarTurma(atividade, turmas) {
  return (
    (atividade.idTurma && turmas.find((t) => t.idTurma === atividade.idTurma)) ||
    turmas.find((t) => normalizar(t.nome) === normalizar(atividade.disciplina)) ||
    null
  );
}

function diaSeguinte(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

function prazoComoData(prazo) {
  return new Date(`${prazo}:00${OFFSET}`);
}

function formatarPrazo(prazo) {
  const [data, hora] = prazo.split('T');
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano} às ${hora}`;
}

function montarEvento(atividade, turma) {
  const [data] = atividade.prazo.split('T');
  const bloco = turma ? horarioNaData(data, turma.horario) : null;

  const descricao = [
    `Disciplina: ${atividade.disciplina}`,
    `Tipo: ${atividade.tipo}`,
    `Prazo de entrega no SIGAA: ${formatarPrazo(atividade.prazo)}`,
  ];
  if (turma) descricao.push(`Turma: ${turma.horario || 'sem horário'}${turma.local ? ` · ${turma.local}` : ''}`);
  descricao.push('', 'Criado automaticamente pela extensão SIGAA → Google Agenda.');

  const evento = {
    summary: `${atividade.tipo}: ${atividade.titulo} — ${atividade.disciplina}`,
    description: descricao.join('\n'),
    extendedProperties: {
      private: { sigaaOrigem: ORIGEM, sigaaId: atividade.chave, sigaaPrazo: atividade.prazo },
    },
  };
  if (turma?.local) evento.location = turma.local;

  if (bloco) {
    evento.start = { dateTime: `${data}T${bloco.inicio}:00${OFFSET}`, timeZone: FUSO };
    evento.end = { dateTime: `${data}T${bloco.fim}:00${OFFSET}`, timeZone: FUSO };
  } else {
    // Sem horário de turma conhecido: evento de dia inteiro na data de entrega.
    evento.start = { date: data };
    evento.end = { date: diaSeguinte(data) };
  }
  return evento;
}

// No PATCH, campos ausentes são mantidos; zera o formato antigo de data para poder trocar
// entre evento com horário e evento de dia inteiro.
function paraAtualizacao(evento) {
  const limpar = (ponto) => (ponto.date ? { ...ponto, dateTime: null, timeZone: null } : { ...ponto, date: null });
  return { ...evento, start: limpar(evento.start), end: limpar(evento.end) };
}

function descreverQuando(evento) {
  const data = evento.start.date || evento.start.dateTime.slice(0, 10);
  const [ano, mes, dia] = data.split('-');
  const quando = `${NOMES_DIAS[diaDaSemana(data)]} ${dia}/${mes}`;
  if (evento.start.date) return `${quando} (dia inteiro)`;
  return `${quando} ${evento.start.dateTime.slice(11, 16)}–${evento.end.dateTime.slice(11, 16)}`;
}

async function sincronizar(dados) {
  const config = await lerConfig();
  const calendarId = config.calendarId || 'primary';
  let resultado;

  try {
    const existentes = await listarEventosSigaa(calendarId, ORIGEM);
    // Atividades que a extensão já colocou nesta agenda. Se uma delas não aparece mais
    // na agenda, foi apagada por você e não é recriada.
    const { vinculos = {} } = await browser.storage.local.get('vinculos');
    const vinculadas = (vinculos[calendarId] ??= {});
    const itens = [];

    for (const atividade of dados.atividades) {
      const evento = montarEvento(atividade, encontrarTurma(atividade, dados.turmas));
      const item = {
        chave: atividade.chave,
        tipo: atividade.tipo,
        titulo: atividade.titulo,
        disciplina: atividade.disciplina,
        prazo: atividade.prazo,
        quando: descreverQuando(evento),
      };

      try {
        const atual = existentes.get(atividade.chave);
        if (atual) {
          vinculadas[atividade.chave] = atual.id;
          if (atual.prazo === atividade.prazo) {
            item.status = 'existente';
          } else {
            await atualizarEvento(calendarId, atual.id, paraAtualizacao(evento));
            item.status = 'atualizado';
            item.detalhe = `prazo mudou${atual.prazo ? ` (era ${formatarPrazo(atual.prazo)})` : ''}`;
          }
        } else if (vinculadas[atividade.chave]) {
          item.status = 'ignorado';
          item.detalhe = 'evento apagado da agenda';
        } else if (!config.incluirVencidas && prazoComoData(atividade.prazo) < new Date()) {
          item.status = 'ignorado';
          item.detalhe = 'prazo já passou';
        } else {
          const criado = await criarEvento(calendarId, evento);
          vinculadas[atividade.chave] = criado.id;
          item.status = 'criado';
        }
      } catch (erro) {
        if (erro instanceof ErroAutenticacao) throw erro;
        item.status = 'erro';
        item.detalhe = erro.message;
      }
      itens.push(item);
    }

    await browser.storage.local.set({ vinculos });
    resultado = { ok: true, em: Date.now(), calendarId, itens };
  } catch (erro) {
    resultado = {
      ok: false,
      em: Date.now(),
      erro: erro.message,
      precisaConectar: erro instanceof ErroAutenticacao,
    };
  }

  await browser.storage.local.set({ ultimaSincronizacao: resultado });
  await atualizarBadge(resultado);
  return resultado;
}

async function sincronizarUltimaLeitura() {
  const { ultimaLeitura } = await browser.storage.local.get('ultimaLeitura');
  if (!ultimaLeitura) {
    return { ok: false, erro: 'Abra o Portal do Discente no SIGAA para a extensão ler as atividades.' };
  }
  return sincronizar(ultimaLeitura);
}

async function atualizarBadge(resultado) {
  let texto = '';
  let cor = '#2e7d32';
  if (!resultado.ok || resultado.itens.some((i) => i.status === 'erro')) {
    texto = '!';
    cor = '#c62828';
  } else {
    const novos = resultado.itens.filter((i) => i.status === 'criado' || i.status === 'atualizado').length;
    if (novos) texto = `+${novos}`;
  }
  await browser.browserAction.setBadgeText({ text: texto });
  await browser.browserAction.setBadgeBackgroundColor({ color: cor });
}

async function estado() {
  const config = await lerConfig();
  const { ultimaSincronizacao, ultimaLeitura } = await browser.storage.local.get([
    'ultimaSincronizacao',
    'ultimaLeitura',
  ]);
  return {
    config,
    conectado: await estaConectado(),
    redirectUri: browser.identity.getRedirectURL(),
    ultimaSincronizacao: ultimaSincronizacao ?? null,
    ultimaLeituraEm: ultimaLeitura?.lidoEm ?? null,
  };
}

async function conectar() {
  try {
    await conectarGoogle();
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
  // Já sincroniza com o que foi lido na última visita ao SIGAA.
  const { ultimaLeitura } = await browser.storage.local.get('ultimaLeitura');
  if (ultimaLeitura) await enfileirar(() => sincronizar(ultimaLeitura));
  return { ok: true };
}

browser.runtime.onMessage.addListener((mensagem) => {
  switch (mensagem?.tipo) {
    case 'DADOS_SIGAA':
      return enfileirar(async () => {
        await browser.storage.local.set({ ultimaLeitura: mensagem.dados });
        return sincronizar(mensagem.dados);
      });
    case 'SINCRONIZAR_AGORA':
      return enfileirar(sincronizarUltimaLeitura);
    case 'CONECTAR':
      return conectar();
    case 'DESCONECTAR':
      return desconectarGoogle().then(() => ({ ok: true }));
    case 'ESQUECER_APAGADOS':
      return browser.storage.local.remove('vinculos').then(() => ({ ok: true }));
    case 'ESTADO':
      return estado();
    default:
      return undefined;
  }
});
