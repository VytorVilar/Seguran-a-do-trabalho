# SST Prime 3.1 — Assistente IA integrado

Esta versão preserva os recursos existentes do site e acrescenta um **Assistente Inteligente de SST** com respostas em tempo real, consulta de CBO em fontes oficiais e geração de descrições prontas para copiar em laudos.

## O que foi adicionado

- Nova página **Assistente IA** no menu lateral e na página inicial.
- Respostas transmitidas ao vivo, enquanto a IA escreve.
- Modos separados para:
  - Chat SST;
  - consulta oficial de CBO;
  - geração de atividades;
  - revisão de texto técnico.
- Campos para função, setor, atividades, máquinas, equipamentos, produtos, tipo de documento e nível de detalhamento.
- Botões para copiar a última resposta, limpar a conversa e abrir a busca oficial da CBO.
- Exibição das fontes oficiais consultadas.
- Backend seguro para o Render, mantendo a chave da OpenAI fora do GitHub.
- Limite de requisições, CORS, cabeçalhos de segurança e chave adicional opcional para proteger o uso da IA.

## Estrutura

```text
Seguran-a-do-trabalho-main/
├── index.html
├── style.css
├── app.js
├── assistant.js       # interface e streaming do chat
├── config.js          # somente a URL pública do backend
├── data.js
├── converter.js
├── sw.js
├── render.yaml
└── backend/
    ├── server.js      # API segura e integração com OpenAI
    ├── package.json
    └── .env.example
```

## 1. Criar a chave da OpenAI

1. Entre na plataforma da OpenAI.
2. Crie uma chave de API para este projeto.
3. Configure faturamento e limite mensal de uso.
4. Não coloque essa chave em `config.js`, `index.html`, `assistant.js` ou no GitHub.

## 2. Publicar o backend no Render

### Opção recomendada: Blueprint

1. Envie este projeto para o GitHub.
2. No Render, escolha **New → Blueprint**.
3. Selecione o repositório.
4. O Render encontrará o arquivo `render.yaml`.
5. Preencha as variáveis solicitadas:

| Variável | Valor |
|---|---|
| `OPENAI_API_KEY` | Sua chave secreta da OpenAI |
| `ALLOWED_ORIGINS` | URL exata do seu GitHub Pages |
| `OPENAI_MODEL` | Pode permanecer `gpt-5.6` |
| `AI_ACCESS_KEY` | O Render pode gerar automaticamente |

Exemplo de `ALLOWED_ORIGINS`:

```text
https://seuusuario.github.io
```

Quando o site estiver dentro de um projeto do GitHub Pages, a origem continua sendo apenas o domínio, sem o nome do repositório.

### Opção manual

Crie um **Web Service** com estas configurações:

```text
Root Directory: backend
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Adicione no painel do Render as variáveis presentes em `backend/.env.example`.

## 3. Conectar o site ao Render

Após a publicação, o Render fornecerá um endereço parecido com:

```text
https://sst-prime-ia.onrender.com
```

Abra `config.js` e substitua:

```js
'https://SEU-BACKEND.onrender.com'
```

pela URL real:

```js
'https://sst-prime-ia.onrender.com'
```

Depois, envie a alteração ao GitHub.

## 4. Usar a chave adicional do assistente

`AI_ACCESS_KEY` não é a chave da OpenAI. É uma senha adicional para evitar que qualquer pessoa use livremente seu backend.

1. Copie o valor de `AI_ACCESS_KEY` configurado no Render.
2. Abra o site.
3. Entre em **Assistente IA**.
4. Digite a senha no campo **Chave de acesso do site**.
5. Clique em **Salvar**.

Ela fica somente no armazenamento local daquele navegador. Não é enviada ao GitHub.

## 5. Testar localmente

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Edite o arquivo `.env` e informe a chave real da OpenAI. O backend local será aberto em:

```text
http://localhost:8787
```

### Frontend

Abra outro terminal na pasta principal:

```bash
python -m http.server 5500
```

Acesse:

```text
http://localhost:5500
```

Em `localhost`, o `config.js` já aponta automaticamente para `http://localhost:8787`.

## Como o modo CBO funciona

No modo **Consultar CBO**, o backend habilita a ferramenta de pesquisa da OpenAI e restringe a busca aos seguintes domínios oficiais:

- `gov.br`;
- `www.gov.br`;
- `cbo.mte.gov.br`;
- `concla.ibge.gov.br`.

A instrução da IA exige que ela:

- não invente códigos;
- apresente o código e o título oficial;
- mostre até três alternativas quando houver ambiguidade;
- diferencie o conteúdo oficial da descrição redigida pela IA;
- declare quando não conseguir validar uma ocupação.

## Segurança e limites

- A tela de login atual continua sendo local e não equivale a uma autenticação de servidor.
- CORS ajuda a restringir o navegador, mas não impede totalmente chamadas externas ao endpoint.
- Para uso privado, mantenha `AI_ACCESS_KEY` ativada.
- Configure limites de gastos na OpenAI.
- O backend limita a quantidade de requisições por endereço IP.
- Não envie CPF, RG, dados médicos ou dados pessoais desnecessários para a IA.
- As respostas devem ser validadas antes de entrarem em PGR, LTCAT, APR, PCMSO, Ordens de Serviço ou outros documentos técnicos.

## Arquivos que normalmente precisam ser personalizados

- `config.js`: URL do backend no Render.
- `backend/.env` ou variáveis do Render: chaves e permissões.
- `backend/server.js`: instruções internas e limites, caso deseje mudar o comportamento.
- `assistant.js`: textos da interface e comandos rápidos.

