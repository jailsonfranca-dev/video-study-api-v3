require('dotenv').config();

const app = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

if (!process.env.VERCEL) {
    app.listen(PORT, HOST, () => {
        console.log(
            `Servidor rodando em http://${HOST}:${PORT}`
        );
    });
}

module.exports = app;