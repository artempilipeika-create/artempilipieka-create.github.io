# Martin Forest Bridge API v1

Backend for the Martin Forest site ↔ local Windows Bridge.

## Data flow

Website -> Railway API -> local poller -> D:\\MartinForestAgent\\bridge\\inbox

Local Bridge/V7 -> outbox -> local poller -> Railway API -> website status

The Railway server never needs inbound access to the Windows PC.

## Endpoints

- `GET /health`
- `POST /api/orders` — create an order
- `GET /api/orders/{order_id}` — status + event history
- `POST /api/agent/pull` — authenticated agent pull
- `POST /api/agent/ack` — authenticated delivery acknowledgement
- `POST /api/agent/events` — authenticated event/status push

## Required environment variables

- `DATABASE_URL` — PostgreSQL connection URL
- `AGENT_API_KEY` — long random secret shared only with the local agent
- `CORS_ORIGINS` — comma-separated allowed browser origins

The browser-facing create-order endpoint does **not** contain an embedded secret. Before public launch, add anti-spam/rate limiting (e.g. Turnstile) at the site/API edge.
