# Agenda SIGAA (Firefox)

Extensão para Firefox que coloca as atividades do SIGAA/UFRN no seu Google Agenda.
Projeto pessoal e **não oficial**, sem vínculo com a UFRN, a STI/UFRN ou o Google.

## Download

### **[⬇ Baixar a última versão (.xpi)](https://github.com/heittorvcs/sigaa-agenda/releases/latest)**

Para instalar, arraste o arquivo `.xpi` para uma janela do Firefox ou use
**about:addons → ⚙ → Instalar extensão de arquivo…**.

---

## Configurar a API do Google Agenda

A extensão usa as **suas próprias credenciais** do Google, então cada pessoa cria as suas.
Isso é feito uma vez só.

### 1. Criar o projeto e ativar a API

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `agenda-sigaa`).
2. Vá em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.

### 2. Configurar a tela de consentimento

Em **Google Auth Platform**:

1. Em **Público-alvo**, escolha o tipo de usuário **Externo**.
2. Em **Branding**, preencha:

   | Campo | Valor |
   |---|---|
   | Nome do app | `Agenda SIGAA`. Não use a palavra "Google": o Google não aceita a marca dele no nome do app. |
   | E-mail de suporte | o seu e-mail |
   | Logo | **deixe vazio**. Com logo, o Google passa a exigir a verificação completa do app. |
   | Página inicial | `https://heittorvcs.github.io/sigaa-agenda/` |
   | Política de privacidade | `https://heittorvcs.github.io/sigaa-agenda/privacidade.html` |
   | Domínios autorizados | `heittorvcs.github.io` |

3. Volte em **Público-alvo** e clique em **Publicar app**.
   - **Não é preciso verificar o app** para uso pessoal. O limite é de até 100 usuários por app.
   - Ao conectar, o Google mostra a tela "O Google não verificou este app". Clique em
     **Avançado → Acessar Agenda SIGAA (não seguro)**.
   - Se preferir não publicar, deixe o app em **Teste** e adicione o seu e-mail como **usuário de teste**.
     A diferença é que nesse modo o Google desconecta a extensão a cada **7 dias**.

### 3. Criar o cliente OAuth

1. Vá em **Clientes → Criar cliente** e escolha o tipo **Aplicativo da Web**.
2. Em **URIs de redirecionamento autorizados** (não em "Origens JavaScript autorizadas"), adicione
   exatamente este endereço, com `https://` e com a barra no final:
   ```
   https://f790a6977f2f716092050edc704952e0eed304f2.extensions.allizom.org/
   ```
   O mesmo endereço aparece no popup da extensão, em **Configurações**, com um botão de copiar.
3. Clique em **Salvar**. A alteração pode levar alguns minutos para valer.
4. Copie o **ID do cliente** e a **Chave secreta do cliente**.

### 4. Conectar a extensão

1. Clique no ícone da extensão, abra **Configurações**, cole o **Client ID** e o **Client Secret** e clique em **Salvar**.
2. Clique em **Conectar Google** e autorize o acesso ao Google Agenda.
3. Abra o Portal do Discente no SIGAA. A sincronização acontece sozinha a cada visita.

Por padrão, os eventos vão para a agenda principal (`primary`). Para usar outra agenda, cole o ID dela
em **ID da agenda**. O ID fica no Google Agenda, em *Configurações da agenda → Integrar agenda*.

### Problemas comuns

| Problema | Causa e solução |
|---|---|
| `Erro 400: redirect_uri_mismatch` | O endereço do passo 3.2 não está no cliente cujo ID foi colado na extensão. Confira se o tipo do cliente é **Aplicativo da Web**, se o endereço está no campo de **redirecionamento** e se você clicou em **Salvar**. Depois espere uns 5 minutos. |
| "O Google não verificou este app" | É o esperado. Clique em **Avançado → Acessar**. |
| A extensão pede para conectar de novo toda semana | O app está em modo **Teste**. Publique o app (passo 2.3). |
| "Conta Google não conectada" no aviso do SIGAA | Clique no ícone da extensão e em **Conectar Google**. |

---

## Apêndice

### A. Como funciona

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

### B. Data e horário do evento

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

### C. Privacidade e segurança

- **SIGAA:** a extensão só lê o portal que você já abriu. Sua senha do SIGAA nunca passa por ela.
- **Google:** a permissão pedida é só `calendar.events` (ver e editar eventos). Não lê e-mail, Drive
  nem contatos.
- **Dados guardados:** Client ID, Client Secret e tokens ficam só no armazenamento local da extensão
  (`browser.storage.local`). **Desconectar** apaga os tokens e revoga o acesso no Google.
- Política completa: <https://heittorvcs.github.io/sigaa-agenda/privacidade.html>

### D. Rodar a partir do código-fonte e assinar

**Para testar (temporário, some ao fechar o Firefox):** abra `about:debugging#/runtime/this-firefox`,
clique em **Carregar extensão temporária…** e selecione o `manifest.json`.

**Para gerar um `.xpi` assinado** (o Firefox comum só instala extensões assinadas pela Mozilla):

1. Aumente a `version` no `manifest.json`. O AMO não aceita reenviar uma versão que já existe.
2. Gere as chaves de API em <https://addons.mozilla.org/developers/addon/api/key/>. O **Emissor JWT**
   é a chave e o **Segredo JWT** é o segredo.
3. Carregue as chaves no terminal. O segredo é digitado sem aparecer e não fica no histórico:
   ```bash
   read -rp "Emissor JWT: " WEB_EXT_API_KEY; read -rsp "Segredo JWT: " WEB_EXT_API_SECRET; echo; export WEB_EXT_API_KEY WEB_EXT_API_SECRET
   ```
4. Assine. A assinatura "não listada" é automática e a extensão não fica pública no AMO:
   ```bash
   npx web-ext sign --channel=unlisted --ignore-files "tests/**" "docs/**" README.md
   ```
5. O `.xpi` fica em `web-ext-artifacts/`. Publique-o numa Release do GitHub:
   ```bash
   gh release create vX.Y.Z web-ext-artifacts/*-X.Y.Z.xpi --title "vX.Y.Z" --notes "..."
   ```

### E. Estrutura do projeto

```
manifest.json                 Manifest V2 (Firefox), ID fixo
content/content.js            Lê turmas e atividades do Portal do Discente
background/horarios.js        Tabela de horários e conversão de "35T34"
background/google.js          OAuth (PKCE + refresh token) e API do Google Agenda
background/sincronizacao.js   Decide o que criar, atualizar ou ignorar
compartilhado/config.js       Configurações do usuário
popup/                        Status, botões e configurações
docs/                         Página inicial e política de privacidade (GitHub Pages)
tests/                        Testes (node --test)
```

### F. Testes

```bash
node --test tests/
```
