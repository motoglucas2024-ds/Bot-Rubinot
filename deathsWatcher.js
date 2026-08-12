const axios = require('axios');
const cheerio = require('cheerio');

async function checkLatestDeaths(client) {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) return;

  try {
    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian');
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

    console.log('🔍 Leyendo HTML de Rubinot...');
    const { data: html } = await axios.get(proxyUrl);

    const $ = cheerio.load(html);

    console.log(`📌 Título de la página: "${$('title').text().trim()}"`);
    console.log(`📌 Tablas encontradas: ${$('table').length}`);
    console.log(`📌 Filas (tr) encontradas: ${$('tr').length}`);
    console.log(`📌 Divs de muertes/registros: ${$('div[class*="death"], div[class*="last"]').length}`);

    // Imprimir las primeras lineas de texto para ver la estructura
    const textPreview = $('body').text().replace(/\s+/g, ' ').slice(0, 300);
    console.log(`📌 Muestra de texto del body: ${textPreview}`);

  } catch (error) {
    console.error('Error en diagnóstico:', error.message);
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  setInterval(() => checkLatestDeaths(client), 60000);
}

module.exports = { startDeathsWatcher };