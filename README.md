# PINGAKSH Jewellery Lookup

Look up sold jewellery by jewels code, IGI number, or HUID, or scan the QR tag on the piece. Details come from the live Pingaksh catalogue — there is no mock data.

## Run

```bash
npm install
cp .env.example .env
npm start
```

Open [http://localhost:4317](http://localhost:4317).

Search examples that exist in the live catalogue: jewels code `26P15872`, IGI `59J4460626`, HUID `ZKFJMT`.

## How lookup works

The browser calls this app only:

```
GET /api/product?search=<code>
```

The server then requests:

```
https://api.pingaksh.co/api/sold-product/get?search=<code>
```

Override the catalogue URL with `PRODUCT_API_BASE_URL` in `.env` if needed. If the API requires a token, set `AuthorizationToken`.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Production-style HTTP server |
| `npm run dev` | Same server with file watch |
| `npm run start:lan` | Local HTTPS for phone camera testing |

Production should be served over **HTTPS** so camera scan and PWA install work.
