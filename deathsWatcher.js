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

    const targetUrl = encodeURIComponent('https://rubinot.com.br/deaths?world=Eldrian');
    // Usamos el tunel de ScraperAPI para evasión de Cloudflare
    const proxyUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${targetUrl}`;

    const { data: html } = await axios.get(proxyUrl);

    const $ = cheerio.load(html);
    const newDeaths = [];

    $('table tr').each((index, element) => {
      if (index === 0) return;

      const columns = $(element).find('td');
      if (columns.length >= 2) {
        const time = $(columns[0]).text().trim();
        const description = $(columns[1]).text().trim();
        const deathId = `${time}_${description}`;

        if (description && !processedDeaths.has(deathId)) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    if (processedDeaths.size === 0) {
      newDeaths.forEach(d => processedDeaths.add(d.deathId));
      return;
    }

    for (const death of newDeaths.reverse()) {
      processedDeaths.add(death.deathId);

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('☠️ Muerte Detectada — Eldrian')
        .setDescription(`**${death.description}**`)
        .setFooter({ text: `Fecha/Hora: ${death.time} | Rubinot` })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }

    if (processedDeaths.size > 100) {
      const entries = Array.from(processedDeaths);
      processedDeaths.clear();
      entries.slice(-50).forEach(id => processedDeaths.add(id));
    }

  } catch (error) {
    console.error('Error al realizar scraping de muertes:', error.message);
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  // Con ScraperAPI revisamos cada 60 segundos para cuidar el plan gratuito de 5.000 peticiones/mes
  setInterval(() => checkLatestDeaths(client), 60000);
}

module.exports = { startDeathsWatcher };