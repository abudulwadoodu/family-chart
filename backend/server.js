import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve .env relative to this file, not process.cwd() - pm2's exec cwd for
// this process is backend/ (see ecosystem/pm2 process config), not the repo
// root, so a bare dotenv.config() silently finds no .env file in production
// and every process.env.* read (DATABASE_URL, COGNITO_*, etc.) comes back
// undefined without any error.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { app } = await import('./app.js');

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
