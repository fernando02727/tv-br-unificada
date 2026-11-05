# 📺 TV BR Unificada

Addon para Nuvio/Stremio que junta os canais ao vivo de vários addons brasileiros em **um catálogo só, sem canais repetidos**.
Cada canal traz como opções de stream os links de **todos** os addons que têm aquele canal. Se um travar, é só escolher outro.

## Como funciona
- `sources.json`: lista de addons de origem (liga/desliga, prioridade, quais catálogos usar).
- `scripts/build-index.mjs`: lê todos os addons, normaliza os nomes ("Globo SP HD", "TV Globo São Paulo" e "GLOBO SP FHD" viram o mesmo canal), separa em grupos e gera `index.json`.
- `.github/workflows/update.yml`: roda o build **automaticamente a cada 30 min** e grava o índice na branch `data`.
- `api/index.js`: o addon em si (Vercel). Serve catálogos/meta e, na hora de assistir, busca os streams ao vivo em cada addon de origem.

## Atualizar
- **Automático:** a cada 30 min, e também sempre que você editar `sources.json`.
- **Manual:** GitHub → aba *Actions* → *Atualizar canais* → **Run workflow** (ou o botão na página inicial do addon).

## Adicionar/remover um addon
Edite `sources.json` no GitHub e adicione um item:
```json
{ "key": "novo", "name": "Nome Bonito", "priority": 12, "enabled": true,
  "manifest": "https://exemplo.com/manifest.json" }
```
Opcional: `"includeCatalogs": ["id1"]`, `"excludeCatalogs": ["id2"]`, `"defaultGroup": "Esportes"`.
Links com dados pessoais (ex.: BestCine) vão como *secret*: use `"manifest": "$ENV:BESTCINE_URL"` e crie o secret `BESTCINE_URL` no GitHub (Settings → Secrets → Actions) **e** a variável de ambiente com o mesmo nome na Vercel.

## Variáveis (Vercel)
| Nome | Para quê |
|---|---|
| `BESTCINE_URL` | link pessoal do BestCine (opcional) |
| `GH_TOKEN` + `REFRESH_KEY` | botão de atualizar com 1 clique (opcional) |
| `INDEX_URL` | só se o repositório não for detectado automaticamente |

## Testar localmente
```
node scripts/build-index.mjs
node scripts/dev-server.mjs   # http://localhost:7000/manifest.json
```
