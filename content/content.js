// Roda nas páginas do SIGAA. No Portal do Discente, lê as turmas e a lista "Minhas atividades"
// e manda para a extensão sincronizar com o Google Agenda.
// Apenas lê o HTML já carregado: não faz requisições ao SIGAA, não clica e não envia formulários.

(() => {
  const painelAtividades = document.querySelector('#avaliacao-portal');
  const painelTurmas = document.querySelector('#turmas-portal');
  if (!painelAtividades || !painelTurmas) return;

  const limpar = (texto) => (texto || '').replace(/\s+/g, ' ').trim();

  function textoDoIntervalo(configurar) {
    const intervalo = document.createRange();
    configurar(intervalo);
    return limpar(intervalo.toString());
  }

  function hash(texto) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  function lerTurmas() {
    const turmas = [];
    for (const celula of painelTurmas.querySelectorAll('td.descricao')) {
      const linha = celula.closest('tr');
      if (linha.closest('.rotator')) continue;
      const infos = linha.querySelectorAll('td.info');
      // "35T34 (10/08/2026 - 19/12/2026)" -> "35T34"
      const horario = (limpar(infos[1]?.textContent).split('(')[0].match(/[2-7]+[MTN]\d+/g) || []).join(' ');
      // A linha seguinte traz o id interno da turma: <td id="linha_12345678">
      const idTurma = linha.nextElementSibling?.querySelector('td[id^="linha_"]')?.id.replace('linha_', '') || null;
      turmas.push({
        idTurma,
        nome: limpar(celula.querySelector('a')?.textContent || celula.textContent),
        local: limpar(infos[0]?.textContent),
        horario,
      });
    }
    return turmas;
  }

  function lerAtividades() {
    const atividades = [];
    for (const linha of painelAtividades.querySelectorAll('tbody tr')) {
      const celulas = linha.querySelectorAll(':scope > td');
      if (celulas.length < 3) continue;

      const data = limpar(celulas[1].textContent).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
      if (!data) continue;
      const [, dia, mes, ano, hora, minuto] = data;

      const celula = celulas[2];
      const br = celula.querySelector('br');
      const rotulo = celula.querySelector('strong');
      const disciplina = br
        ? textoDoIntervalo((r) => { r.setStart(celula, 0); r.setEndBefore(br); })
        : limpar(celula.textContent);
      const tipo = limpar(rotulo?.textContent).replace(/:$/, '') || 'Atividade';
      const titulo = rotulo
        ? textoDoIntervalo((r) => { r.setStartAfter(rotulo); r.setEnd(celula, celula.childNodes.length); })
        : '';

      // O link da atividade tem o id dela no SIGAA: {'id':'123456789','idTurma':'12345678'}
      const onclick = celula.querySelector('a[onclick]')?.getAttribute('onclick') || '';
      const id = onclick.match(/'id'\s*:\s*'(\d+)'/)?.[1];
      const idTurma = onclick.match(/'idTurma'\s*:\s*'(\d+)'/)?.[1] || null;
      const tipoChave = tipo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\W+/g, '-');

      atividades.push({
        chave: id ? `${tipoChave}-${id}` : `${tipoChave}-h${hash(`${disciplina}|${titulo}`)}`,
        idTurma,
        disciplina,
        tipo,
        titulo: titulo || tipo,
        prazo: `${ano}-${mes}-${dia}T${hora}:${minuto}`,
      });
    }
    return atividades;
  }

  function criarAviso() {
    const hospedeiro = document.createElement('div');
    hospedeiro.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const raiz = hospedeiro.attachShadow({ mode: 'closed' });
    const estilo = document.createElement('style');
    estilo.textContent = `
      .aviso { font: 13px/1.4 system-ui, sans-serif; max-width: 340px; padding: 10px 14px; border-radius: 8px;
               background: #1e293b; color: #f8fafc; box-shadow: 0 4px 16px rgba(0,0,0,.25); cursor: pointer; }
      .aviso b { display: block; margin-bottom: 2px; }
      .ok { border-left: 4px solid #22c55e; }
      .erro { border-left: 4px solid #ef4444; }
      .info { border-left: 4px solid #3b82f6; }`;
    const caixa = document.createElement('div');
    const titulo = document.createElement('b');
    titulo.textContent = 'SIGAA → Google Agenda';
    const texto = document.createElement('span');
    caixa.append(titulo, texto);
    raiz.append(estilo, caixa);
    hospedeiro.addEventListener('click', () => hospedeiro.remove());
    document.body.appendChild(hospedeiro);

    let temporizador;
    return (mensagem, tipo, duracaoMs) => {
      caixa.className = `aviso ${tipo}`;
      texto.textContent = mensagem;
      clearTimeout(temporizador);
      if (duracaoMs) temporizador = setTimeout(() => hospedeiro.remove(), duracaoMs);
    };
  }

  function resumir(resultado) {
    if (!resultado?.ok) {
      return resultado?.precisaConectar
        ? `${resultado.erro} Clique no ícone da extensão para conectar.`
        : `Erro: ${resultado?.erro || 'falha desconhecida'}`;
    }
    const conta = (status) => resultado.itens.filter((i) => i.status === status).length;
    const partes = [];
    if (conta('criado')) partes.push(`${conta('criado')} evento(s) criado(s)`);
    if (conta('atualizado')) partes.push(`${conta('atualizado')} atualizado(s)`);
    if (conta('existente')) partes.push(`${conta('existente')} já estava(m) na agenda`);
    if (conta('ignorado')) partes.push(`${conta('ignorado')} ignorado(s)`);
    if (conta('erro')) partes.push(`${conta('erro')} com erro`);
    return partes.length ? `${partes.join(', ')}.` : 'Nenhuma atividade encontrada no portal.';
  }

  const dados = { turmas: lerTurmas(), atividades: lerAtividades(), lidoEm: Date.now() };
  const avisar = criarAviso();
  avisar(`Verificando ${dados.atividades.length} atividade(s)…`, 'info');

  browser.runtime
    .sendMessage({ tipo: 'DADOS_SIGAA', dados })
    .then((resultado) => {
      const comErro = !resultado?.ok || resultado.itens.some((i) => i.status === 'erro');
      const mudou = resultado?.ok && resultado.itens.some((i) => i.status === 'criado' || i.status === 'atualizado');
      avisar(resumir(resultado), comErro ? 'erro' : 'ok', comErro ? 15000 : mudou ? 8000 : 4000);
    })
    .catch((erro) => avisar(`Erro: ${erro.message}`, 'erro', 15000));
})();
