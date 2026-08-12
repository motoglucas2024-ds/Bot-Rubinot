const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!channelId || !apiKey) {
    console.log('❌ Faltan variables de entorno DEATHS_CHANNEL_ID o SCRAPER_API_KEY en Render.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.log('❌ No se encontró el canal de Discord.');
      return;
    }

    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian');
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

    console.log('🔍 Consultando muertes en Rubinot a través de ScraperAPI...');
    const { data: html } = await axios.get(proxyUrl);

    const $ = cheerio.load(html);
    const newDeaths = [];

    // Buscamos todas las filas de tabla o contenedores con información
    $('table tr').each((index, element) => {
      if (index === 0) return; // Saltar encabezado

      const columns = $(element).find('td');
      if (columns.length >= 2) {
        const time = $(columns[0]).text().trim();
        const description = $(columns[1]).text().trim();
        const deathId = `${time}_${description}`;

        if (description) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    console.log(`📊 Muertes encontradas en la web: ${newDeaths.length}`);

    // Muestra hasta 3 muertes recientes para confirmar que funciona
    for (const death of newDeaths.slice(0, 3)) {
      if (!processedDeaths.has(death.deathId)) {
        processedDeaths.add(death.deathId);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('☠️ Muerte Detectada — Eldrian')
          .setDescription(`**${death.description}**`)
          .setFooter({ text: `Fecha/Hora: ${death.time} | Rubinot` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`✅ Mensaje enviado al canal: ${death.description}`);
      }
    }

  } catch (error) {
    console.error(' Error en el proceso de scraping:', error.message);
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  setInterval(() => checkLatestDeaths(client), 60000);
}

module.exports = { startDeathsWatcher };