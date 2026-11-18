const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Deriv Relay is Live!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (client) => {
  console.log('Client connected');
  const deriv = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

  deriv.on('open', () => {
    console.log('Connected to Deriv');
  });

  deriv.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data.toString());
    }
  });

  client.on('message', (data) => {
    if (deriv.readyState === WebSocket.OPEN) {
      deriv.send(data.toString());
    }
  });

  const closeBoth = () => {
    try { deriv.close(); } catch (e) {}
    try { client.close(); } catch (e) {}
  };

  client.on('close', closeBoth);
  deriv.on('close', closeBoth);
  client.on('error', closeBoth);
  deriv.on('error', closeBoth);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log('Relay listening on ' + PORT);
});
