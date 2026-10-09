# Putting Upwork Pro on a server

For Shabkhaiz. Follow it top to bottom; each step says how to check it worked. At the end the team opens Upwork Pro at one
https address and each person connects their own Claude to it.

**Read this first.** Upwork Pro has only run on Hamza's computer so far. These steps come from how the app is built and from
its own notes, but nobody has run them on a server yet, and signing in from Claude has only been tested locally. If a step does
not behave as written, stop and tell Hamza what you saw instead of working around it.

## What you are setting up

| Piece | What it is | Listens on |
| --- | --- | --- |
| Web app and API | `backend`, started with `npm start` | 127.0.0.1:3000 |
| Worker | `backend`, started with `npm run start:worker`. Does all the AI work. **Exactly one copy.** | nothing |
| Claude connector (MCP) | `mcp`, started with `npm run start:http` | 127.0.0.1:3100 |
| Database | MySQL or MariaDB, database `upwork_gate` | 127.0.0.1:3306 |
| Nginx with a certificate | The only thing open to the internet. Sends `/mcp` to the connector and everything else to the web app. | 443 |

## What you need before you start

- A Linux server (Ubuntu 22.04 or newer, 2 GB memory or more) you can reach with ssh and sudo.
- A domain name pointing at it, for example `pro.stackupsolutions.com`. Below it is written `YOUR-DOMAIN`.
- Access to the GitHub repository `Hamzzay/Upwork-Pro`, branch `hamza`.
- From Hamza, sent privately (never in a chat channel, never in git): the AI key, and the email he wants for the first admin.

## 1. Install the basics

```bash
sudo apt update && sudo apt install -y nginx mariadb-server git certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2
```

Check: `node -v` shows v22, `nginx -v` and `mariadb --version` answer.

## 2. Get the code

```bash
sudo mkdir -p /srv && sudo chown $USER /srv && cd /srv
git clone -b hamza https://github.com/Hamzzay/Upwork-Pro.git upwork-pro
```

## 3. Create the database

Open `backend/sql/setup.sql`, replace both `change-me` with one strong password, then run it as the database root:

```bash
cd /srv/upwork-pro/backend && sudo mariadb < sql/setup.sql
```

Check: `mariadb -u upwork_gate -p upwork_gate -e "select 1"` asks for that password and prints 1.

## 4. Fill in the settings

```bash
cd /srv/upwork-pro/backend && cp .env.example .env && chmod 600 .env && nano .env
```

| Setting | Put |
| --- | --- |
| `NODE_ENV` | `production` (this makes the sign-in cookie https only) |
| `PORT` | `3000` |
| `DB_PASSWORD` | the password from step 3 |
| `LLM_PROVIDER` | `claude-cli` (`mock` writes fake answers and is only for testing) |
| The AI key | whichever Hamza gave you: `LLM_API_KEY` (GLM through Z.ai), `ANTHROPIC_API_KEY` (Claude) or `OPENAI_API_KEY` (GPT). Which AI is used is then chosen in the app, under Settings. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | the first admin. The password needs 10 characters or more. |
| `PUBLIC_URL` | `https://YOUR-DOMAIN` |
| `MCP_URL` | `https://YOUR-DOMAIN/mcp` |

`.env` is never committed and never pasted anywhere.

## 5. Build and load the data

```bash
cd /srv/upwork-pro/backend
npm ci
npm run build
npm run migrate:prod
npm run seed:prod
npm run setup:import:prod
npm run setup:import:prod -- --apply
```

- `migrate:prod` creates the tables. It should end with "schema up to date".
- `seed:prod` creates the first admin.
- `setup:import:prod` first shows what it would load (the rules, signals, proposal types, writing guide, tags, projects,
  profiles and settings from `seed/setup/setup.json`); with `-- --apply` it loads them. It deletes nothing.

```bash
cd /srv/upwork-pro/mcp && npm ci && npm run build
```

## 6. Start the three programs

Create `/srv/upwork-pro/ecosystem.config.js` with this content, changing `YOUR-DOMAIN`:

```js
module.exports = { apps: [
  { name: 'upwork-pro-web', cwd: '/srv/upwork-pro/backend', script: 'dist/src/server.js', env: { NODE_ENV: 'production' } },
  // the worker: one copy only, never cluster mode, and time to finish the AI call it is on
  { name: 'upwork-pro-worker', cwd: '/srv/upwork-pro/backend', script: 'dist/src/worker.js', instances: 1, exec_mode: 'fork', kill_timeout: 10000, env: { NODE_ENV: 'production' } },
  { name: 'upwork-pro-mcp', cwd: '/srv/upwork-pro/mcp', script: 'dist/src/index.js', args: '--http',
    env: { UPWORK_PRO_URL: 'http://127.0.0.1:3000', UPWORK_PRO_PUBLIC_URL: 'https://YOUR-DOMAIN', MCP_URL: 'https://YOUR-DOMAIN/mcp' } },
] };
```

```bash
cd /srv/upwork-pro && pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

Run the command `pm2 startup` prints, so everything comes back after a reboot.

Check: `pm2 status` shows three programs online. `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/` prints 200.
`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/mcp` prints 401 (it wants a sign-in: that is correct).

## 7. Nginx and the certificate

Create `/etc/nginx/sites-available/upwork-pro`, changing `YOUR-DOMAIN`:

```nginx
server {
  listen 80;
  server_name YOUR-DOMAIN;
  client_max_body_size 5m;

  # the Claude connector
  location /mcp { proxy_pass http://127.0.0.1:3100; proxy_http_version 1.1; proxy_set_header Host $host; proxy_buffering off; proxy_read_timeout 300s; }
  location /.well-known/oauth-protected-resource { proxy_pass http://127.0.0.1:3100; proxy_set_header Host $host; }

  # everything else: the web app, the API and the sign-in pages for Claude
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 120s; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/upwork-pro /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR-DOMAIN
```

Certbot adds the https part and renews the certificate by itself. Leave ports 3000, 3100 and 3306 closed to the outside
(`sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`).

## 8. Check it end to end

1. Open `https://YOUR-DOMAIN`. Sign in as the first admin. You land on the Dashboard.
2. Projects, Rules and Writing guide are filled (from step 5).
3. Settings: pick the AI, press **Test connection**. It should say it works. Then **Use this AI**.
4. Screen a job: paste any job page text. Within about a minute it shows Pass, Flag or Fail. If it stays on "Screening", the
   worker is not running or the AI key is wrong: `pm2 logs upwork-pro-worker`.
5. `curl -s https://YOUR-DOMAIN/.well-known/oauth-protected-resource` prints a line naming `https://YOUR-DOMAIN/mcp`.
6. Connect Claude: on the Connect Claude page copy the connector link. In Claude: Settings, Connectors, Add custom connector,
   name it Upwork Pro, paste the link, Connect, sign in, Allow. Then ask Claude "what profiles does Upwork Pro have?".
   **This step has never been tried against a real server.** If Claude cannot connect, send Hamza what Claude said and the output
   of `pm2 logs upwork-pro-mcp --lines 50`.

## 9. Hand over to the team

1. Users: add each person with a temporary password (give it to them privately) and their role.
2. Change the first admin's password if it was shared with anyone.
3. Send the team the address, the guide (`guide/index.html` in the repository) and the plugin file
   `stackup-proposals-0.4.0.plugin`.

## Updating later

```bash
cd /srv/upwork-pro && git pull
cd backend && npm ci && npm run build && npm run migrate:prod
cd ../mcp && npm ci && npm run build
cd .. && pm2 restart all
```

Back the database up before every update: `mariadb-dump -u upwork_gate -p upwork_gate > ~/upwork_gate-$(date +%F).sql`.
Set that up as a nightly job too, and keep a copy off the server.

## Things to know

- **One worker.** Two workers would run the same job twice and double the AI cost.
- **Never** commit, paste or message `.env`, keys, tokens or passwords.
- Sign-in attempts are limited (8 tries per email in 10 minutes) and counted in memory, so a restart resets the count. Behind
  Nginx every person looks like the same address to the app, so the limit is in effect per email: after 8 wrong passwords for
  one email, that email waits up to 10 minutes wherever it signs in from.
- Bringing over the jobs already on Hamza's computer is a separate task (a database copy). A fresh server starts with the
  library and setup, and no jobs.
- Logs: `pm2 logs`. Who did what inside the app: Logs, in the sidebar.
