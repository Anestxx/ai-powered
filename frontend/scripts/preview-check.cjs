// Preview the production frontend against the disposable browser-test API.
const express = require('express');
const path = require('node:path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
app.use(createProxyMiddleware({ target: 'http://127.0.0.1:8017', pathFilter: ['/api', '/ws/events'], ws: true }));
app.use(express.static(path.join(__dirname, '../build')));
app.listen(3001, '127.0.0.1', () => console.log('Browser-test frontend: http://localhost:3001'));
