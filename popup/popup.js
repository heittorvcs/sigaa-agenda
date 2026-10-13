const $ = (id) => document.getElementById(id);

const ROTULOS_STATUS = {
  criado: 'Criado',
  atualizado: 'Atualizado',
  existente: 'Já na agenda',
  ignorado: 'Ignorado',
  erro: 'Erro',
};

function enviar(tipo) {
  return browser.runtime.sendMessage({ tipo });
}

function formatarDataHora(ms) {
  return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderizarConta(estado) {
  const status = $('status-conta');
  status.textContent = estado.conectado ? 'Google conectado' : 'Google não conectado';
  status.className = `status ${estado.conectado ? 'conectado' : 'desconectado'}`;
  const configurado = Boolean(estado.config.clientId && estado.config.clientSecret);
  $('btn-conectar').hidden = estado.conectado;
  $('btn-conectar').disabled = !configurado;
  $('btn-desconectar').hidden = !estado.conectado;
  $('aviso-config').hidden = configurado;
}

function renderizarSincronizacao(resultado) {
  const lista = $('itens');
  lista.replaceChildren();
  if (!resultado) return;

  if (!resultado.ok) {
    $('resumo').textContent = `${formatarDataHora(resultado.em)} — ${resultado.erro}`;
    return;
  }
  const agenda = resultado.calendarId === 'primary' ? 'agenda principal' : resultado.calendarId;
  $('resumo').textContent = `${formatarDataHora(resultado.em)} · ${resultado.itens.length} atividade(s) · ${agenda}`;

  for (const item of resultado.itens) {
    const li = document.createElement('li');
    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = item.titulo;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const chip = document.createElement('span');
    chip.className = `chip ${item.status}`;
    chip.textContent = ROTULOS_STATUS[item.status] ?? item.status;
    meta.append(chip, `${item.disciplina} · ${item.quando}${item.detalhe ? ` · ${item.detalhe}` : ''}`);
    li.append(titulo, meta);
    lista.append(li);
  }
}

async function atualizar() {
  const estado = await enviar('ESTADO');
  renderizarConta(estado);
  renderizarSincronizacao(estado.ultimaSincronizacao);
  $('cfg-client-id').value = estado.config.clientId;
  $('cfg-client-secret').value = estado.config.clientSecret;
  $('cfg-calendar-id').value = estado.config.calendarId;
  $('cfg-vencidas').checked = estado.config.incluirVencidas;
  $('cfg-redirect').value = estado.redirectUri;
  if (!estado.config.clientId) $('configuracoes').open = true;
}

// Executa a ação, recarrega o estado e mostra a mensagem que a ação devolver (se houver).
async function comBotao(botao, acao) {
  botao.disabled = true;
  let mensagem;
  try {
    mensagem = await acao();
  } catch (erro) {
    mensagem = erro.message;
  } finally {
    botao.disabled = false;
    await atualizar();
  }
  if (mensagem) $('resumo').textContent = mensagem;
}

$('btn-conectar').addEventListener('click', (e) =>
  comBotao(e.target, async () => {
    // A janela de login do Google pode fechar este popup; o background continua o processo.
    const r = await enviar('CONECTAR');
    return r.ok ? null : r.erro;
  }),
);

$('btn-desconectar').addEventListener('click', (e) => comBotao(e.target, () => enviar('DESCONECTAR')));

$('btn-sincronizar').addEventListener('click', (e) =>
  comBotao(e.target, async () => {
    $('resumo').textContent = 'Sincronizando…';
    const r = await enviar('SINCRONIZAR_AGORA');
    return !r.ok && !r.em ? r.erro : null;
  }),
);

$('btn-salvar').addEventListener('click', (e) =>
  comBotao(e.target, async () => {
    await salvarConfig({
      clientId: $('cfg-client-id').value.trim(),
      clientSecret: $('cfg-client-secret').value.trim(),
      calendarId: $('cfg-calendar-id').value.trim() || 'primary',
      incluirVencidas: $('cfg-vencidas').checked,
    });
    $('msg-config').textContent = 'Configurações salvas.';
  }),
);

$('btn-esquecer').addEventListener('click', (e) =>
  comBotao(e.target, async () => {
    await enviar('ESQUECER_APAGADOS');
    $('msg-config').textContent = 'Pronto: eventos apagados serão recriados na próxima sincronização.';
  }),
);

$('btn-copiar').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('cfg-redirect').value);
  $('btn-copiar').textContent = 'Copiado';
});

atualizar();
