import dotenv from 'dotenv';

dotenv.config();

const { app } = await import('./app.js');

const port = Number(process.env.PORT || 3001);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
