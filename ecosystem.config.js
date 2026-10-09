module.exports = { apps: [
    {
      name: 'upwork-pro-web',
      cwd: '/var/www/html/Upwork-Pro/backend',
      script: 'dist/src/server.js',
      env: { NODE_ENV: 'production', PORT: '6021' }        // web app on 6021
    },
    {
      name: 'upwork-pro-worker',
      cwd: '/var/www/html/Upwork-Pro/backend',
      script: 'dist/src/worker.js',
      instances: 1, exec_mode: 'fork', kill_timeout: 10000,
      env: { NODE_ENV: 'production' }                       // no port — does AI work only
    },
    {
      name: 'upwork-pro-mcp',
      cwd: '/var/www/html/Upwork-Pro/mcp',
      script: 'dist/src/index.js',
      args: '--http',
      env: {
        MCP_PORT: '6023',                                   // connector on 6022
        MCP_HOST: '127.0.0.1',
        UPWORK_PRO_URL: 'http://127.0.0.1:6021',            // <-- points at the web app's NEW port
        UPWORK_PRO_PUBLIC_URL: 'https://upworkpro.stackupsolutions.co',
        MCP_URL: 'https://upworkpro.stackupsolutions.co/mcp'
      }
    }
  ] };
