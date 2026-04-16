// Minimal WebSocket echo server for chaos-maker E2E tests.
// Echoes every message back to the same client. Binds to 127.0.0.1:8081.
// Kept as plain JS (not TS) so Playwright `webServer` can `node` it directly.

const { WebSocketServer } = require('ws');

const PORT = Number(process.env.WS_ECHO_PORT || 8081);
const server = new WebSocketServer({ host: '127.0.0.1', port: PORT });

server.on('connection', (socket) => {
  socket.on('message', (data, isBinary) => {
    // ws gives us a Buffer by default; preserve binary-ness.
    socket.send(data, { binary: isBinary });
  });
});

server.on('listening', () => {
  // Print a stable marker line so Playwright's webServer `url` probe (which
  // only checks socket connectability) works; the log aids local debugging.
  console.log(`[ws-echo] listening on ws://127.0.0.1:${PORT}`);
});

// Graceful shutdown when Playwright stops us.
const close = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
