const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use(
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      pathFilter: ['/api', '/ws/events'],
      ws: true,
    })
  );
};
