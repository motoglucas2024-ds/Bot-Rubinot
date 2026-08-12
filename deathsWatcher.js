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
    // Intentar entrar enviando el parámetro por URL directamente
    await page.goto('https://rubinot.com.br/deaths?world=Eldrian', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Esperar a que la página base cargue
    await new Promise(r => setTimeout(r, 2000));

    // Si existe el desplegable, cambiarlo y forzar el evento CHANGE
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      selects.forEach(select => {
        for (let option of select.options) {
          if (option.text.toLowerCase().includes('eldrian') || option.value.toLowerCase().includes('eldrian')) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      });
    });

    // Esperar 4 segundos a que la tabla se re-renderice
    await new Promise(r => setTimeout(r, 4000));

    // Extraer cualquier fila, celda o lista relevante de la pantalla
    const deaths = await page.evaluate(() => {
      const result = [];
      
      // Buscar en cualquier elemento que contenga texto de muertes
      const allElements = Array.from(document.querySelectorAll('table tr, tr, .row, .list-group-item, div'));

      allElements.forEach(el => {
        // Solo tomar nodos hoja o elementos con texto directo
        const text = el.innerText ? el.innerText.trim() : '';
        
        // Criterio de filtrado de muerte en Rubinot/Tibia
        if (text && (text.includes('Died at') || text.includes('Killed at') || text.includes('murió a nivel') || text.includes('died at level'))) {
          // Limpiar saltos de línea excesivos
          const cleanText = text.replace(/\s+/g, ' ');
          
          // Evitar guardar duplicados de contenedores padre
          if (!result.some(r => r.description.includes(cleanText))) {
            const deathId = cleanText;
            result.push({ time: 'Reciente', description: cleanText, deathId });
          }
        }
      });

      return result;
    });

    console.log(`📊 Muertes obtenidas con Puppeteer: ${deaths.length}`);

    // Si no encontró nada con el filtro escrito, imprimir un fragmento para depuración
    if (deaths.length === 0) {
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
      console.log('⚠️ No se detectaron muertes. Vista previa del texto de la página:', bodyText.replace(/\s+/g, ' '));
    }

    // Inicializar memoria en el primer ciclo
    if (processedDeaths.size === 0 && deaths.length > 0) {
      deaths.forEach(d => processedDeaths.add(d.deathId));
      console.log('✅ Historial inicial de muertes memorizado correctamente.');
      return;
    }

    // Enviar las muertes nuevas a Discord
    for (const death of deaths.reverse()) {
      if (!processedDeaths.has(death.deathId)) {
        processedDeaths.add(death.deathId);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('☠️ Muerte Detectada — Eldrian')
          .setDescription(`**${death.description}**`)
          .setFooter({ text: 'Rubinot Watcher' })
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