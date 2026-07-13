/**
 * PM2 production processes — runs on AWS EC2 24/7.
 * Public URL: https://eligibly-facing-unloved.ngrok-free.dev
 *
 * Apply: npm run pm2:setup   (or: pm2 start ecosystem.config.cjs && pm2 save)
 */
const NGROK_URL = "https://eligibly-facing-unloved.ngrok-free.dev";

module.exports = {
  apps: [
    {
      name: "sponsorship-platform",
      cwd: "/home/ubuntu/Market_Sponsorship_Automation/frontend",
      script: "node_modules/.bin/next",
      args: "start",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
    },
    {
      name: "ngrok-tunnel",
      script: "/usr/local/bin/ngrok",
      args: `http 3000 --url=${NGROK_URL}`,
      interpreter: "none",
      autorestart: true,
      max_restarts: 30,
      restart_delay: 10000,
      // ngrok cloud needs time to release endpoint after crash (ERR_NGROK_334)
    },
  ],
};
