# Chatwoot Campaign Hub 🚀

Aplicação web completa, moderna e responsiva para gerenciamento e disparo de campanhas em massa integrada diretamente à API oficial do **Chatwoot**.

---

## 📌 Funcionalidades Principais

1. **Autenticação Segura & Gestão de Credenciais**:
   - Login inicial com usuário temporário: `Edgard` e senha: `edgard@123`.
   - Senha armazenada exclusivamente via hash criptográfico PBKDF2-SHA512 com salt.
   - Possibilidade de alterar usuário e senha a qualquer momento na aba Configurações.

2. **Conexões Oficiais com o Chatwoot**:
   - Cadastro de múltiplas contas/instâncias (ex: `https://conversa.nortetelecom.net.br`).
   - Armazenamento com criptografia AES-256-GCM para tokens de acesso da API.
   - Botão para testar conexão em tempo real e consultar inboxes disponíveis.
   - Endpoints oficiais utilizados:
     - `GET /api/v1/accounts/{account_id}/inboxes` (Listagem de canais/inboxes)
     - `GET /api/v1/accounts/{account_id}/contacts/search?q={phone}` (Busca de contato)
     - `POST /api/v1/accounts/{account_id}/contacts` (Criação de contato com atributos)
     - `POST /api/v1/accounts/{account_id}/conversations` (Abertura de conversa com mensagem de saída)
     - `POST /api/v1/accounts/{account_id}/conversations/{id}/messages` (Envio de mensagem)

3. **Assistente de Campanhas em 8 Etapas**:
   - Etapa 1: Nome e descrição da campanha.
   - Etapa 2: Seleção da conexão Chatwoot.
   - Etapa 3: Seleção do canal/inbox de saída (WhatsApp, API, etc.).
   - Etapa 4: Importação de contatos via CSV ou seleção de Lista Salva.
   - Etapa 5: Criação ou escolha de mensagem-base na Biblioteca.
   - Etapa 6: Adição de variações manuais ou geradas por IA.
   - Etapa 7: Configuração de cadência de envio (intervalo mínimo/máximo em segundos) e **disparo de teste para 1 número**.
   - Etapa 8: Resumo executivo e início da campanha.

4. **Gerador de Variações com IA (OpenAI)**:
   - Integração com a API da OpenAI (modelos `gpt-4o-mini`, `gpt-4o`, etc.).
   - Preservação estrita das tags dinâmicas como `{{name}}` e `{{phone_number}}`.
   - Modos de tom: Mais comercial, Mais curto, Mais natural, Mais amigável, Urgência.
   - Interface de revisão para aprovar individualmente cada variação antes de incluí-la.
   - Fallback inteligente com Google Gemini caso configurado.

5. **Motor de Fila e Disparo em Segundo Plano**:
   - Execução assíncrona desacoplada do navegador (continua disparando mesmo fechando a aba).
   - Intervalos aleatórios configuráveis para respeitar políticas anti-spam do canal.
   - Pausa, retomada e cancelamento com 1 clique.
   - Auto-retomada de campanhas ativas em caso de reinicialização do servidor.

6. **Histórico e Logs Detalhados**:
   - Tabela completa de logs: Nome, Telefone, Mensagem utilizada, Canal, Horário, Status e Erro.
   - Filtros por: Todos, Enviado, Pendente, Erro.
   - Sanitização automática de tokens em mensagens de erro.
   - Exportação do relatório em CSV.

7. **Reutilização e Clonagem**:
   - Botão **"Criar nova campanha baseada nesta"** para duplicar configurações, mensagens e variações em uma nova base.

8. **Listas de Contatos Salvas**:
   - Módulo exclusivo de listas para reaproveitar contatos sem reenviar arquivos CSV.
   - Mapeamento flexível de colunas do CSV e normalização internacional E.164 (+55 para Brasil).

---

## 🛠️ Instalação e Execução Local

### Pré-requisitos
- Node.js 20+ ou 22+
- npm ou yarn

### Passo a Passo
```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# 3. Acessar a aplicação
# http://localhost:3000
```

Credenciais iniciais:
- **Usuário**: `Edgard`
- **Senha**: `edgard@123`

---

## 🐳 Deploy Próprio com Docker e PostgreSQL

A aplicação está pronta para rodar em produção com Docker Compose e PostgreSQL.

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Subir os containers do App e PostgreSQL
docker-compose up -d --build

# 3. Verificar status dos logs
docker-compose logs -f
```

O arquivo `migrations/001_init.sql` será executado automaticamente pelo container do PostgreSQL na primeira inicialização, criando todas as tabelas, índices e o usuário `Edgard`.

---

## 🔒 Segurança

- Todos os tokens de acesso do Chatwoot e chaves da OpenAI são armazenados exclusivamente no backend sob criptografia AES-256-GCM.
- Nenhuma chave ou token sensível é enviado ao frontend ou exposto no console do navegador.
- Toda saída de erro da API do Chatwoot passa pelo filtro `sanitizeError`, removendo parâmetros de autenticação e tokens.
