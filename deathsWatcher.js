const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const { EmbedBuilder } = require('discord.js');

// Activar plugin para omitir protecciones de bots
puppeteer.use(StealthPlugin());

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  if (!channelId) return;

  let browser = null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Sobrescribir User-Agent para simular un navegador real
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    );

    // Navegar directamente a la página que renderiza las muertes (HTML procesado)
    await page.goto('https://rubinot.com.br/deaths?world=Eldrian', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Esperar a la tabla
    await page.waitForSelector('table, tr', { timeout: 15000 }).catch(() => {});

    // Extraer muertes del DOM
    const deaths = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      const result = [];

      rows.forEach((row, index) => {
        if (index === 0) return; // Ignorar cabecera
        const cols = row.querySelectorAll('td');
        if (cols.length >= 2) {
          const time = cols[0].innerText.trim();
          const description = cols[1].innerText.trim();
          if (description) {
            result.push({ time, description, deathId: `${time}_${description}` });
          }
        }
      });

      return result;
    });

    // Ignorar primera corrida para no spammear el canal con el historial viejo
    if (processedDeaths.size === 0 && deaths.length > 0) {
      deaths.forEach(d => processedDeaths.add(d.deathId));
      return;
    }

    // Enviar alertas de nuevas muertes
    for (const death of deaths.reverse()) {
      if (!processedDeaths.has(death.deathId)) {
        processedDeaths.add(death.deathId);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('☠️ Muerte Detectada — Eldrian')
          .setDescription(`**${death.description}**`)
          .setFooter({ text: `Hora: ${death.time} | RubinOT` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      }
    }

  } catch (error) {
    console.error('Error al obtener muertes:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

function startDeathsWatcher(client) {
  checkLatestDeaths(client);
  setInterval(() => checkLatestDeaths(client), 60000); // Revisar cada 1 minuto
}

module.exports = { startDeathsWatcher };