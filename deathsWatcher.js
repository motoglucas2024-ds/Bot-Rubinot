const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!channelId || !apiKey) {
    console.log('❌ Faltan variables DEATHS_CHANNEL_ID o SCRAPER_API_KEY.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    // Petición a la URL de muertes enviando parámetros de Rubinot
    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian');
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

    console.log('🔍 Consultando muertes de Eldrian en Rubinot...');
    const { data: html } = await axios.get(proxyUrl);

    const $ = cheerio.load(html);
    const newDeaths = [];

    // Recorremos las filas de la tabla buscando texto de nivel o muerte
    $('tr').each((_, element) => {
      const rowText = $(element).text().trim().replace(/\s+/g, ' ');
      
      // Si la fila contiene palabras clave típicas de la tabla de Rubinot
      if (rowText.includes('murió') || rowText.includes('died') || rowText.includes('nivel')) {
        const columns = $(element).find('td');
        
        let time = 'Reciente';
        let description = rowText;

        if (columns.length >= 2) {
          time = $(columns[0]).text().trim();
          description = $(columns[1]).text().trim().replace(/\s+/g, ' ');
        }

        const deathId = `${time}_${description}`;
        if (description && description.length > 5) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    console.log(`📊 Muertes obtenidas para Eldrian: ${newDeaths.length}`);

    // Si es la primera ejecución, memoriza las existentes para no spammear
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
  setInterval(() => checkLatestDeaths(client), 45000);
}

module.exports = { startDeathsWatcher };