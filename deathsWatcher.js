const puppeteer = require('puppeteer');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  if (!channelId) {
    console.log('❌ Falta la variable DEATHS_CHANNEL_ID.');
    return;
  }

  let browser = null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    console.log('🔍 Iniciando navegador Puppeteer...');

    // Ruta exacta donde se instaló Chrome en el servidor
    const chromePath = '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');

    console.log('🌐 Accediendo a Rubinot Deaths...');
    await page.goto('https://rubinot.com.br/deaths', { waitUntil: 'networkidle2', timeout: 60000 });

    // Intentar seleccionar el mundo Eldrian si existe un formulario/select
    const hasSelect = await page.$('select');
    if (hasSelect) {
      await page.select('select', 'Eldrian').catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }

    // Extraer datos directamente del navegador cargado
    const deaths = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      const result = [];

      rows.forEach((row, index) => {
        if (index === 0) return;
        const cols = row.querySelectorAll('td');
        if (cols.length >= 2) {
          const time = cols[0].innerText.trim();
          const description = cols[1].innerText.trim();
          if (description && (description.includes('murió') || description.includes('died') || description.includes('nivel'))) {
            result.push({ time, description, deathId: `${time}_${description}` });
          }
        }
      });

      return result;
    });

    console.log(`📊 Muertes obtenidas con Puppeteer: ${deaths.length}`);

    if (processedDeaths.size === 0 && deaths.length > 0) {
      deaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial de muertes memorizado correctamente.');
      return;
    }

    for (const death of deaths.reverse()) {
      if (!processedDeaths.has(death.deathId)) {
        processedDeaths.add(death.deathId);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('☠️ Muerte Detectada — Eldrian')
          .setDescription(`**${death.description}**`)
          .setFooter({ text: `Fecha/Hora: ${death.time} | Rubinot` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`🚀 Notificación de muerte enviada a Discord: ${death.description}`);
      }
    }

  } catch (error) {
    console.error('Error durante la ejecución de Puppeteer:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  setInterval(() => checkLatestDeaths(client), 60000);
}

module.exports = { startDeathsWatcher };