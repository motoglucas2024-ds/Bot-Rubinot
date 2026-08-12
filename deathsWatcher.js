const puppeteer = require('puppeteer');
const { EmbedBuilder } = require('discord.js');

const processedDeaths = new Set();

async function checkLatestDeaths(client) {
  const channelId = process.env.DEATHS_CHANNEL_ID;
  if (!channelId) return;

  let browser = null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    console.log('🔍 Iniciando navegador headless...');
    
    // Iniciar Puppeteer con flags para compatibilidad en servidores Linux/Render
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    
    // Configurar User-Agent de navegador real
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log('🌐 Navegando a Rubinot Deaths...');
    await page.goto('https://rubinot.com.br/deaths', { waitUntil: 'networkidle2', timeout: 45000 });

    // Seleccionar el mundo Eldrian si existe el selector
    const selectExists = await page.$('select');
    if (selectExists) {
      await page.select('select', 'Eldrian').catch(() => {});
      await page.waitForTimeout(2000); // Esperar a que refresque los datos
    }

    // Extraer datos de la tabla directamente desde el navegador
    const deaths = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      const result = [];

      rows.forEach((row, index) => {
        if (index === 0) return; // Saltar encabezado
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

    console.log(`📊 Muertes obtenidas con Puppeteer: ${deaths.length}`);

    // Si es el primer arranque, guardar historial para evitar spam
    if (processedDeaths.size === 0 && deaths.length > 0) {
      deaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial memorizado.');
      return;
    }

    // Notificar las nuevas muertes
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
        console.log(`🚀 Enviada a Discord: ${death.description}`);
      }
    }

  } catch (error) {
    console.error('Error al consultar muertes con Puppeteer:', error.message);
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