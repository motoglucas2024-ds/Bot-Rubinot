const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!channelId || !apiKey) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    // Forzamos la URL exacta encoded y activamos renderizado dinámico ligero
    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian');
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}&render=true&country_code=us`;

    console.log('🔍 Consultando muertes de Eldrian en Rubinot...');
    const { data: html } = await axios.get(proxyUrl, { timeout: 30000 });

    const $ = cheerio.load(html);
    const newDeaths = [];

    // Buscamos cualquier fila de tabla en el HTML renderizado
    $('table tr, div.table-row, .death-row').each((_, element) => {
      const text = $(element).text().trim().replace(/\s+/g, ' ');
      
      // Si el texto de la fila incluye patrones de muerte en Rubinot
      if (text.includes('murió') || text.includes('died') || text.includes('nivel') || text.includes('level')) {
        const columns = $(element).find('td, div');
        let time = 'Reciente';
        let description = text;

        if (columns.length >= 2) {
          time = $(columns[0]).text().trim();
          description = $(columns[1]).text().trim().replace(/\s+/g, ' ');
        }

        const deathId = `${time}_${description}`;
        if (description && description.length > 10) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    console.log(`📊 Muertes obtenidas para Eldrian: ${newDeaths.length}`);

    // Si es la primera ejecución y encuentra datos, memoriza el estado actual
    if (processedDeaths.size === 0 && newDeaths.length > 0) {
      newDeaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial memorizado correctamente.');
      return;
    }

    // Publicamos únicamente las muertes nuevas
    for (const death of newDeaths.reverse()) {
      if (!processedDeaths.has(death.deathId)) {
        processedDeaths.add(death.deathId);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('☠️ Muerte Detectada — Eldrian')
          .setDescription(`**${death.description}**`)
          .setFooter({ text: `Fecha/Hora: ${death.time} | Rubinot` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`🚀 Notificación enviada a Discord: ${death.description}`);
      }
    }

  } catch (error) {
    console.error('Error al consultar muertes:', error.message);
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  // Revisamos cada 60 segundos
  setInterval(() => checkLatestDeaths(client), 60000);
}

module.exports = { startDeathsWatcher };