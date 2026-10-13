// Autenticação no Google (OAuth 2.0 com PKCE + refresh token) e chamadas à API do Google Agenda.

const ESCOPO_AGENDA = 'https://www.googleapis.com/auth/calendar.events';
const URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_REVOGAR = 'https://oauth2.googleapis.com/revoke';
const URL_API_AGENDA = 'https://www.googleapis.com/calendar/v3';

class ErroAutenticacao extends Error {}

function base64Url(bytes) {
  let binario = '';
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textoAleatorio(tamanho) {
  return base64Url(crypto.getRandomValues(new Uint8Array(tamanho)));
}

async function pedirToken(parametros) {
  const { clientId, clientSecret } = await lerConfig();
  const resposta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...parametros }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(corpo.error_description || corpo.error || `HTTP ${resposta.status}`);
    erro.codigo = corpo.error;
    throw erro;
  }
  return corpo;
}

async function salvarTokens(tokens, refreshTokenAnterior) {
  await browser.storage.local.set({
    auth: {
      refreshToken: tokens.refresh_token || refreshTokenAnterior,
      accessToken: tokens.access_token,
      expiraEm: Date.now() + tokens.expires_in * 1000,
    },
  });
}

// Abre a janela de login/consentimento do Google. Precisa ser chamado a partir de uma ação do usuário.
async function conectarGoogle() {
  const { clientId, clientSecret } = await lerConfig();
  if (!clientId || !clientSecret) {
    throw new ErroAutenticacao('Preencha o Client ID e o Client Secret nas configurações da extensão.');
  }

  const redirectUri = browser.identity.getRedirectURL();
  const verificador = textoAleatorio(48);
  const desafio = base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
  const estado = textoAleatorio(16);

  const url = new URL(URL_AUTORIZACAO);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPO_AGENDA,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: desafio,
    code_challenge_method: 'S256',
    state: estado,
  });

  const retorno = new URL(await browser.identity.launchWebAuthFlow({ url: url.href, interactive: true }));
  if (retorno.searchParams.get('error')) {
    throw new ErroAutenticacao(`O Google recusou o acesso: ${retorno.searchParams.get('error')}`);
  }
  if (retorno.searchParams.get('state') !== estado) {
    throw new ErroAutenticacao('Resposta do Google inválida (state não confere).');
  }

  const tokens = await pedirToken({
    grant_type: 'authorization_code',
    code: retorno.searchParams.get('code'),
    code_verifier: verificador,
    redirect_uri: redirectUri,
  });
  if (!tokens.refresh_token) {
    throw new ErroAutenticacao('O Google não devolveu um refresh token. Tente conectar novamente.');
  }
  await salvarTokens(tokens);
}

async function desconectarGoogle() {
  const { auth } = await browser.storage.local.get('auth');
  await browser.storage.local.remove('auth');
  if (auth?.refreshToken) {
    await fetch(URL_REVOGAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: auth.refreshToken }),
    }).catch(() => {});
  }
}

async function estaConectado() {
  const { auth } = await browser.storage.local.get('auth');
  return Boolean(auth?.refreshToken);
}

async function obterTokenAcesso(forcarRenovacao = false) {
  const { auth } = await browser.storage.local.get('auth');
  if (!auth?.refreshToken) throw new ErroAutenticacao('Conta Google não conectada.');
  if (!forcarRenovacao && auth.accessToken && auth.expiraEm - 60_000 > Date.now()) return auth.accessToken;

  try {
    const tokens = await pedirToken({ grant_type: 'refresh_token', refresh_token: auth.refreshToken });
    await salvarTokens(tokens, auth.refreshToken);
    return tokens.access_token;
  } catch (erro) {
    if (erro.codigo === 'invalid_grant' || erro.codigo === 'invalid_client' || erro.codigo === 'unauthorized_client') {
      await browser.storage.local.remove('auth');
      throw new ErroAutenticacao('O acesso ao Google expirou ou foi revogado. Conecte a conta novamente.');
    }
    throw erro;
  }
}

async function chamarAgenda(caminho, { metodo = 'GET', corpo } = {}, tentativa = 0) {
  const token = await obterTokenAcesso(tentativa > 0);
  const resposta = await fetch(URL_API_AGENDA + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resposta.status === 401 && tentativa === 0) return chamarAgenda(caminho, { metodo, corpo }, 1);
  if (!resposta.ok) {
    const detalhe = await resposta.json().catch(() => null);
    throw new Error(`Google Agenda respondeu ${resposta.status}: ${detalhe?.error?.message || resposta.statusText}`);
  }
  return resposta.status === 204 ? null : resposta.json();
}

// Todos os eventos criados pela extensão nesta agenda: Map<sigaaId, { id, prazo }>.
async function listarEventosSigaa(calendarId, origem) {
  const eventos = new Map();
  let pageToken;
  do {
    const query = new URLSearchParams({
      privateExtendedProperty: `sigaaOrigem=${origem}`,
      maxResults: '2500',
      showDeleted: 'false',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const pagina = await chamarAgenda(`/calendars/${encodeURIComponent(calendarId)}/events?${query}`);
    for (const evento of pagina.items ?? []) {
      const props = evento.extendedProperties?.private;
      if (props?.sigaaId) eventos.set(props.sigaaId, { id: evento.id, prazo: props.sigaaPrazo });
    }
    pageToken = pagina.nextPageToken;
  } while (pageToken);
  return eventos;
}

function criarEvento(calendarId, evento) {
  return chamarAgenda(`/calendars/${encodeURIComponent(calendarId)}/events`, { metodo: 'POST', corpo: evento });
}

function atualizarEvento(calendarId, eventId, alteracoes) {
  return chamarAgenda(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { metodo: 'PATCH', corpo: alteracoes },
  );
}
