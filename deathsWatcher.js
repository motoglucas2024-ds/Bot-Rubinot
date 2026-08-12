const axios = require('axios');
const cheerio = require('cheerio');
const { EmbedBuilder } = require('discord.js');

// Guardaremos los IDs/textos de muertes procesadas para evitar repetidos
const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    // Petición a la sección de muertes de Eldrian en Rubinot con cabeceras de navegador real
    const url = 'https://rubinot.com.br/deaths?world=Eldrian'; 
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const $ = cheerio.load(html);
    const newDeaths = [];

    // Recorremos las filas de la tabla de muertes
    $('table tr').each((index, element) => {
      if (index === 0) return; // Saltar encabezado de la tabla

      const columns = $(element).find('td');
      if (columns.length >= 2) {
        const time = $(columns[0]).text().trim();
        const description = $(columns[1]).text().trim(); // Ej: "PlayerX died at level 150 by a Demon"

        // Crear una clave única usando tiempo y descripción
        const deathId = `${time}_${description}`;

        if (description && !processedDeaths.has(deathId)) {
          newDeaths.push({ deathId, time, description });
        }
      }
    });

    // Si es la primera vez que inicia el bot, solo guardamos las muertes existentes
    if (processedDeaths.size === 0) {
      newDeaths.forEach(d => processedDeaths.add(d.deathId));
      return;
    }

    // Publicamos las muertes nuevas de forma cronológica (de la más vieja a la más nueva)
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

    // Evitar desbordamiento de memoria guardando solo los últimos 100 registros
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
  // Ejecutar inmediatamente al inicio
  checkLatestDeaths(client);
  // Revisar cada 45 segundos para no saturar la web de Rubinot
  setInterval(() => checkLatestDeaths(client), 45000);
}

module.exports = { startDeathsWatcher };