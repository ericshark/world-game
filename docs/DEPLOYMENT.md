# World Game deployment

The site, API, and multiplayer WebSocket server share
https://world-game-0qhx.onrender.com. Render Free builds the repository's
Dockerfile from GitHub `main`. Check Actions and Render deploy logs after a
push, then check `/health/ready` and join a room from two browsers.

Render supplies `RENDER_EXTERNAL_URL`. Keep `DAILY_SECRET` in Render and
configure `RESEND_API_KEY` and `MAIL_FROM` only when a sender is verified.
Email and OAuth sign-in are unconfigured. SQLite is container-local, so
idle shutdowns, restarts, and redeploys can erase scores and guest sessions.
To roll back code, deploy a previously verified commit from Render.
