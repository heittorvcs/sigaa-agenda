# SIGAA → Google Agenda (Firefox)

Extensão para Firefox que, sempre que você abre o **Portal do Discente** do SIGAA/UFRN, lê a lista
**"Minhas atividades"** e cria no Google Agenda um evento para cada atividade que ainda não está lá.

> Projeto pessoal e **não oficial**, sem vínculo com a UFRN, a STI/UFRN ou o Google.
> Página: <https://heittorvcs.github.io/sigaa-agenda/> · [Política de Privacidade](https://heittorvcs.github.io/sigaa-agenda/privacidade.html)

## Como funciona

1. Ao abrir `sigaa.ufrn.br/sigaa/portais/discente/discente.jsf`, o content script lê o HTML que já
   está na página:
   - **Turmas do Semestre**: nome, local, código de horário (`35T34`) e id interno da turma;
   - **Minhas atividades**: prazo, disciplina, tipo, título e id da atividade no SIGAA.

   Ele **não faz requisições ao SIGAA, não clica em nada e não envia formulários**. Só lê a página.
2. O background consulta o Google Agenda: busca os eventos que a própria extensão criou, marcados com
   `extendedProperties.private.sigaaId`, e compara com as atividades.
3. Para cada atividade:

   | Situação | O que acontece |
   |---|---|
   | Ainda não está na agenda | Cria o evento |
   | Já está na agenda | Nada |
   | Já está, mas o professor mudou o prazo | Atualiza data e horário do evento |
   | Você apagou o evento da agenda | Não recria (botão **Recriar apagados** no popup) |
   | Prazo já passou e não está na agenda | Ignora (opção **Criar eventos também para atividades com prazo vencido**) |

4. Um aviso no canto da página e o popup da extensão mostram o resultado.

### Data e horário do evento

- **Data**: a data final de entrega.
- **Horário**: o horário da disciplina naquele dia da semana, convertido pela tabela abaixo.
  Exemplo: uma disciplina `6T56` com entrega em 16/10/2026 (sexta) vira 16/10, das 16:40 às 18:20.
- Se a disciplina não tem aula no dia da entrega, usa o horário do primeiro dia de aula dela.
  Exemplo: `35T34` com entrega numa sexta vira sexta, das 14:50 às 16:30.
- Se a disciplina não tem horário (ou não foi encontrada), o evento fica como **dia inteiro**.

Código `35T34`: dias `3` (terça) e `5` (quinta), turno `T` (tarde), aulas `3` e `4`.
Dias: 2 = seg, 3 = ter, 4 = qua, 5 = qui, 6 = sex, 7 = sáb.

| Aula | Manhã (M) | Tarde (T) | Noite (N) |
|---|---|---|---|
| 1 | 07:00–07:50 | 13:00–13:50 | 18:40–19:30 |
| 2 | 07:50–08:40 | 13:50–14:40 | 19:30–20:20 |
| 3 | 08:50–09:40 | 14:50–15:40 | 20:30–21:20 |
| 4 | 09:40–10:30 | 15:40–16:30 | 21:20–22:10 |
| 5 | 10:50–11:30 | 16:40–17:30 | |
| 6 | 11:30–12:30 | 17:30–18:20 | |

A tabela fica em [background/horarios.js](background/horarios.js), caso precise de ajuste.

---

## Configuração (uma vez só)

### 1. Credenciais do Google (Google Cloud Console)

A extensão acessa **só a sua agenda**, com as suas próprias credenciais.

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `sigaa-agenda`).
2. **APIs e serviços → Biblioteca** → procure **Google Calendar API** → **Ativar**.
3. **Google Auth Platform** (ou *Tela de consentimento OAuth*):
   - Tipo de usuário: **Externo**. Preencha o nome do app (sem a palavra "Google", ex.: `Agenda SIGAA`)
     e o seu e-mail. **Não envie logo**: com logo, o Google passa a exigir a verificação completa do app.
   - Em **Público-alvo**, adicione o seu e-mail Google como **usuário de teste**.
   - Importante: enquanto o app estiver em *Teste*, o Google invalida o acesso a cada **7 dias** e você
     precisa clicar em **Conectar Google** de novo. Para evitar isso, clique em **Publicar app**
     (não precisa de verificação para uso pessoal). Para publicar, o Google exige página inicial e
     política de privacidade: use as da pasta [docs/](docs/), publicadas no GitHub Pages, e adicione o
     domínio delas em **Domínios autorizados**. Na hora de conectar, o Google mostra o aviso
     "app não verificado": clique em *Avançado → Acessar*.
4. **Clientes → Criar cliente**:
   - Tipo de aplicativo: **Aplicativo da Web**.
   - **URIs de redirecionamento autorizados**:
     ```
     https://f790a6977f2f716092050edc704952e0eed304f2.extensions.allizom.org/
     ```
     Esse endereço também aparece em **Configurações** no popup da extensão, com botão de copiar.
     Ele é fixo porque o ID da extensão é fixo (`sigaa-agenda-google@heittor`).
5. Copie o **ID do cliente** e a **Chave secreta do cliente**.

### 2. Instalar no Firefox

**Para testar (temporário, some ao fechar o Firefox):**

1. Abra `about:debugging#/runtime/this-firefox`.
2. **Carregar extensão temporária…** → selecione o arquivo `manifest.json` desta pasta.

**Para uso diário (permanente):** o Firefox comum só instala extensões assinadas pela Mozilla.
A assinatura "não listada" é gratuita e automática, e a extensão **não** fica pública:

1. Crie uma conta em <https://addons.mozilla.org> e gere as chaves de API em
   <https://addons.mozilla.org/developers/addon/api/key/>.
2. Nesta pasta, rode:
   ```bash
   npx web-ext sign --channel=unlisted --ignore-files "tests/**" "docs/**" README.md --api-key=SUA_CHAVE --api-secret=SEU_SEGREDO
   ```
3. Arraste o `.xpi` gerado em `web-ext-artifacts/` para uma janela do Firefox.

Também dá para usar o **Firefox Developer Edition** ou o **Nightly**, com
`xpinstall.signatures.required = false` em `about:config`, e instalar o `.zip` da pasta sem assinar.

### 3. Conectar

1. Clique no ícone da extensão → **Configurações** → cole o **Client ID** e o **Client Secret** → **Salvar**.
2. Clique em **Conectar Google** e autorize o acesso ao Google Agenda.
3. Abra o Portal do Discente no SIGAA. A sincronização acontece sozinha.

Por padrão os eventos vão para a agenda principal (`primary`). Para usar outra agenda, cole o ID
dela em **ID da agenda**. O ID fica em *Google Agenda → Configurações da agenda → Integrar agenda*.

---

## Privacidade e segurança

- **SIGAA:** a extensão só lê o portal que você já abriu. Sua senha do SIGAA nunca passa por ela.
- **Google:** a permissão pedida é só `calendar.events` (ver e editar eventos). Não lê e-mail, Drive
  nem contatos.
- **Dados guardados:** Client ID, Client Secret e tokens ficam só no armazenamento local da extensão
  (`browser.storage.local`). **Desconectar** apaga os tokens e revoga o acesso no Google.

## Estrutura

```
manifest.json                 Manifest V2 (Firefox), ID fixo
content/content.js            Lê turmas e atividades do Portal do Discente
background/horarios.js        Tabela de horários e conversão de "35T34"
background/google.js          OAuth (PKCE + refresh token) e API do Google Agenda
background/sincronizacao.js   Decide o que criar, atualizar ou ignorar
compartilhado/config.js       Configurações do usuário
popup/                        Status, botões e configurações
tests/                        Testes (node --test)
docs/                         Página inicial e política de privacidade (GitHub Pages)
```

## Testes

```bash
node --test tests/
```
