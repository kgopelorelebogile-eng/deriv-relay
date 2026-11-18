const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const RELAY_KEY = process.env.DERIV_RELAY_KEY || 'PulseView-2026-Secret-Key';

function checkKey(req, res, next) {
  const key = req.headers['x-relay-key'] || req.query.key;
  if (RELAY_KEY && key !== RELAY_KEY) {
    return res.status(401).json({ error: 'Invalid relay key' });
  }
  next();
}

app.get('/', (req, res) => {
  res.send('Deriv Relay is Live!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasRequestEndpoint: true });
});

// Main endpoint Base44 expects
app.post('/request', checkKey, async (req, res) => {
  try {
    const payload = req.body.request || req.body.payload || req.body;
    const deriv = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { deriv.close(); } catch(e){}
        res.status(504).json({ error: 'Deriv timeout' });
      }
    }, 15000);
    deriv.on('open', () => deriv.send(JSON.stringify(payload)));
    deriv.on('message', (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        const json = JSON.parse(data.toString());
        res.json(json);
      } catch(e) {
        res.json({ raw: data.toString() });
      }
      try { deriv.close(); } catch(e){}
    });
    deriv.on('error', (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        res.status(500).json({ error: e.message });
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Keep old /api working too
app.post('/api', checkKey, (req, res) => {
  req.url = '/request';
  app.handle(req, res);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (client, req) => {
  const url = new URL(req.url, 'http://localhost');
  const key = req.headers['x-relay-key'] || url.searchParams.get('key');
  if (RELAY_KEY && key && key !== RELAY_KEY) {
    client.close(1008, 'Invalid key');
    return;
  }
  const deriv = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
  deriv.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  });
  client.on('message', (data) => {
    if (deriv.readyState === WebSocket.OPEN) deriv.send(data.toString());
  });
  const closeBoth = () => {
    try { deriv.close(); } catch(e) {}
    try { client.close(); } catch(e) {}
  };
  client.on('close', closeBoth);
  deriv.on('close', closeBoth);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log('Relay listening on ' + PORT));
