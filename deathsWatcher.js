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

    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian');
    // Agregamos &render=true para forzar la ejecución de JavaScript en la web de Rubinot
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}&render=true`;

    console.log('🔍 Renderizando JavaScript de Rubinot...');
    const { data: html } = await axios.get(proxyUrl);

    const $ = cheerio.load(html);
    const newDeaths = [];

    // 1. Intento por tablas estándar HTML
    $('table tr').each((index, element) => {
      if (index === 0) return;

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

    // 2. Si no encontró tablas, intenta buscar en divs/listas dinámicas
    if (newDeaths.length === 0) {
      $('div, tr, li').each((_, element) => {
        const text = $(element).text().trim();
        // Identifica textos típicos de muertes en Tibia (ej: "Died at level", "killed at level")
        if (text.match(/died at level|killed at level|by a|by an/i) && text.length < 250) {
          const deathId = text.replace(/\s+/g, ' ');
          if (!newDeaths.some(d => d.deathId === deathId)) {
            newDeaths.push({ deathId, time: 'Reciente', description: deathId });
          }
        }
      });
    }

    console.log(`📊 Total de muertes procesadas tras renderizado: ${newDeaths.length}`);

    // Publicamos hasta 3 muertes recientes para confirmar funcionamiento
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
        console.log(`✅ Mensaje de muerte enviado a Discord: ${death.description}`);
      }
    }

  } catch (error) {
    console.error('Error al realizar scraping de muertes:', error.message);
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  // Revisamos cada 90 segundos para optimizar el uso de créditos de renderizado en ScraperAPI
  setInterval(() => checkLatestDeaths(client), 90000);
}

module.exports = { startDeathsWatcher };