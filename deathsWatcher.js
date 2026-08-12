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

    // URL original objetivo de Rubinot
    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths');
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

    // Enviamos una petición POST simulando la selección de "Eldrian" en el formulario
    const response = await axios.post(proxyUrl, new URLSearchParams({
      'world': 'Eldrian',
      'guild': '',
      'min_level': '0',
      'death_type': 'all'
    }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const $ = cheerio.load(response.data);
    const newDeaths = [];

    // Recorremos las filas de la tabla principal
    $('table tr').each((index, element) => {
      const columns = $(element).find('td');
      if (columns.length >= 2) {
        const time = $(columns[0]).text().trim();
        const description = $(columns[1]).text().trim();
        const deathId = `${time}_${description}`;

        // Filtramos encabezados o textos vacíos
        if (description && description.includes('murió') || description.includes('died')) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    console.log(`📊 Muertes obtenidas para Eldrian: ${newDeaths.length}`);

    // Si es la primera ejecución, memoriza las existentes
    if (processedDeaths.size === 0 && newDeaths.length > 0) {
      newDeaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial memorizado.');
      return;
    }

    // Publica solo las muertes que no han sido enviadas antes
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
        console.log(`🚀 Enviada a Discord: ${death.description}`);
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