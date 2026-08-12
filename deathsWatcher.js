const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!channelId || !apiKey) {
    console.log('❌ Faltan variables de entorno DEATHS_CHANNEL_ID o SCRAPER_API_KEY.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    // URL estructurada con los filtros exactos que usa la web
    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian&guild=&min_level=0&death_type=all');
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

    console.log('🔍 Consultando muertes de Eldrian en Rubinot...');
    const { data: html } = await axios.get(proxyUrl);

    const $ = cheerio.load(html);
    const newDeaths = [];

    // Recorremos las filas de la tabla
    $('table tr').each((index, element) => {
      const columns = $(element).find('td');
      if (columns.length >= 2) {
        const time = $(columns[0]).text().trim();
        const description = $(columns[1]).text().trim();
        const deathId = `${time}_${description}`;

        // Validar que la descripción corresponda a un registro de muerte válido
        if (description && (description.includes('murió') || description.includes('died') || description.includes('nivel'))) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    console.log(`📊 Muertes obtenidas para Eldrian: ${newDeaths.length}`);

    // Primera ejecución: guarda las muertes actuales para no spammear
    if (processedDeaths.size === 0 && newDeaths.length > 0) {
      newDeaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial memorizado correctamente.');
      return;
    }

    // Envío a Discord de las muertes nuevas
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
  setInterval(() => checkLatestDeaths(client), 45000);
}

module.exports = { startDeathsWatcher };