# SAP Report Generator

Aplicacao web (Next.js) para montar previews de relatorios SAP Fiori a partir de um prompt simples.

A ideia central: um usuario leigo descreve o relatorio em linguagem natural, a IA sugere o mapping de campos (CDS View + CDS Field), o usuario revisa isso em tela e valida a UX/UI em um sandbox Fiori antes da integracao real com OData no backend SAP.

## Objetivo do projeto

- Reduzir friccao para criar relatorios Fiori freestyle.
- Evitar que o usuario precise escrever XML/Controller manualmente.
- Permitir validacao visual rapida (titulo, filtros e tabela) antes do desenvolvimento ABAP/OData.

## Fluxo funcional (atual)

1. Usuario escreve um prompt em ingles na tela inicial.
2. Frontend chama `POST /api/map-fields`.
3. A API usa OpenAI (ou fallback mock) para gerar `fields[]` com:
   - `displayName`
   - `cdsView`
   - `cdsField`
   - `type` (`string|number|date|boolean`)
4. Usuario revisa os campos e marca:
   - quais vao para tabela
   - quais vao para filtros
5. Frontend gera dados mock locais e chama `POST /api/preview`.
6. Backend cria um preview isolado e retorna `previewUrl`.
7. Um iframe renderiza o preview Fiori usando UI5 runtime.
8. No modo SmartTable, o runtime consome um OData V2 mock (`/api/preview/[id]/odata/...`) para carregar metadata, filtros e dados.

## Decisao de arquitetura

### 1) IA so para mapping

A IA fica responsavel por sugerir o mapping de campos. O layout base do app Fiori continua padronizado no projeto.

Vantagem:
- Menos variacao e menos erro de geracao.
- Usuario tem controle visual imediato via checkboxes (tabela/filtro).
- Facil de evoluir para OData real depois.

### 2) Preview desacoplado

O preview roda em rota dedicada + iframe, isolando CSS/JS do app principal.

Vantagem:
- Nao contamina estado do React principal.
- Permite simular runtime UI5 proximo de um app real.

### 3) SmartTable para validar UX funcional

Quando ha metadados de colunas, o runtime tenta SmartFilterBar + SmartTable (com personalizacao, sort, variantes, export etc.).

## Estrutura de pastas (principal)

```text
app/
  api/
    map-fields/route.ts                    # gera mapping via IA (ou mock)
    preview/route.ts                       # cria preview e token
    preview/[id]/route.ts                  # entrega HTML sandbox do preview
    preview/[id]/odata/[[...path]]/route.ts# endpoint OData V2 mock para SmartTable
  page.tsx                                 # fluxo UI: prompt -> mapping -> preview

lib/
  map-fields/service.ts                    # logica de prompt/schema/chamada OpenAI
  preview/createPreviewPayload.ts          # monta payload final do preview
  preview/buildPreviewHtml.ts              # HTML do sandbox (iframe)
  preview/controllerConfig.ts              # config declarativa de comportamento
  previewStore.ts                          # store em memoria com TTL
  previewToken.ts                          # token assinado para recuperar preview
  types.ts                                 # tipos compartilhados

public/
  ui5-preview-runtime.js                   # runtime UI5 que constroi SmartTable/XML preview
```

## API endpoints

### `POST /api/map-fields`

Entrada:

```json
{
  "prompt": "Create a purchasing report with Supplier, Material, Net Amount"
}
```

Saida (exemplo):

```json
{
  "fields": [
    {
      "displayName": "Supplier",
      "cdsField": "Supplier",
      "cdsView": "I_PurchaseOrderItemAPI01",
      "type": "string"
    }
  ],
  "_meta": {
    "source": "openai",
    "reason": null
  }
}
```

### `POST /api/preview`

Entrada:

```json
{
  "name": "Generated Report",
  "fields": [],
  "filterFields": [],
  "mockData": []
}
```

Saida (exemplo):

```json
{
  "previewId": "uuid",
  "previewUrl": "/api/preview/<id>?token=<token>",
  "previewToken": "...",
  "createdAt": "2026-02-16T12:00:00.000Z"
}
```

### `GET /api/preview/[id]`

Retorna o HTML sandbox que carrega UI5 + runtime de preview.

### `GET /api/preview/[id]/odata/...`

Mock OData V2 para SmartTable:
- root service
- `$metadata`
- `PreviewSet`
- `PreviewSet/$count`
- suporte basico a `$filter`, `$orderby`, `$select`, `$skip`, `$top`

## Variaveis de ambiente

Crie `.env.local`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
MOCK_AI=false
PREVIEW_TOKEN_SECRET=troque-esta-chave-em-producao
```

Observacoes:
- Se `OPENAI_API_KEY` nao existir, o projeto cai automaticamente para mock.
- `MOCK_AI=true` forca modo mock mesmo com chave configurada.

## Como rodar

```bash
npm install
npm run dev
```

Abrir: `http://localhost:3000`

## Estado atual e limitacoes

- OData e dados ainda sao mock para validacao de UX.
- Mapeamento de CDS ainda e heuristico (depende de prompt + IA).
- Export Excel da SmartTable pode variar conforme configuracao/local do runtime.
- Store de previews em memoria (nao persistente).

## Proximos passos recomendados

1. Conectar catalogo real de CDS para grounding da IA.
2. Persistir projetos (prompt, mappings, versoes de preview).
3. Implementar modo "Publish" para gerar artefatos Fiori/ABAP consumiveis.
4. Trocar mock OData por servico real com associations.
5. Adicionar suite de testes para map-fields e parser OData.

## Guideline de prompt (atual)

Padrao recomendado para usuario final:
- Sempre em ingles.
- Informar claramente entidade e campos desejados.

Exemplo bom:

`Create a sales report with Sales Order, Item, Quantity, Status, and Delivery Date`

## Seguranca

- `controllerJs` livre foi desabilitado por seguranca no payload de preview.
- O token de preview e assinado com HMAC e possui expiracao.
- HTML do preview escapa conteudo para reduzir risco de injecao.
