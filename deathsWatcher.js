const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  if (!channelId) {
    console.log('❌ Falta la variable DEATHS_CHANNEL_ID en el entorno.');
    return;
  }

  let browser = null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    console.log('🔍 Iniciando navegador Puppeteer (Core + Chromium)...');

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36');

    console.log('🌐 Accediendo a Rubinot Deaths...');
    await page.goto('https://rubinot.com.br/deaths', { waitUntil: 'networkidle0', timeout: 60000 });

    // 1. Forzar la selección del mundo Eldrian en el formulario
    const selectSelector = 'select[name="world"], select';
    const hasSelect = await page.$(selectSelector);
    if (hasSelect) {
      await page.select(selectSelector, 'Eldrian').catch(() => {});
      // Esperar a que los datos AJAX del desplegable terminen de cargar
      await new Promise(r => setTimeout(r, 4000));
    }

    // 2. Extraer los datos buscando filas generales o contenedores dinámicos
    const deaths = await page.evaluate(() => {
      const result = [];
      // Buscar elementos de tabla o contenedores flex/grid habitualmente usados
      const elements = Array.from(document.querySelectorAll('table tr, .table-row, div[class*="death"]'));

      elements.forEach((el) => {
        const text = el.innerText ? el.innerText.trim() : '';
        // Validar si la fila contiene texto relevante de muertes
        if (text && (text.includes('murió') || text.includes('died') || text.includes('Killed') || text.includes('Level') || text.includes('nivel'))) {
          const parts = text.split('\n').map(p => p.trim()).filter(Boolean);
          
          let time = 'Reciente';
          let description = text.replace(/\s+/g, ' ');

          if (parts.length >= 2) {
            time = parts[0];
            description = parts.slice(1).join(' ');
          }

          const deathId = `${time}_${description}`;
          result.push({ time, description, deathId });
        }
      });

      return result;
    });

    console.log(`📊 Muertes obtenidas con Puppeteer: ${deaths.length}`);

    // Si es la primera ejecución, memorizar para no duplicar antiguas
    if (processedDeaths.size === 0 && deaths.length > 0) {
      deaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial de muertes memorizado correctamente.');
      return;
    }

    // Publicar muertes nuevas en Discord
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
        console.log(`🚀 Notificación enviada a Discord: ${death.description}`);
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