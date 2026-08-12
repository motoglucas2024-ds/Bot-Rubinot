require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const respawns = require('./respawns');

// Servidor Web para Render (mantener activo gratis)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🤖 Bot activo 24/7'));
app.listen(PORT, () => console.log(`🌐 Servidor en puerto ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const DATA_FILE = path.join(__dirname, 'claims.json');

function loadClaims() {
  if (!fs.existsSync(DATA_FILE)) return new Map();
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    return new Map(Object.entries(JSON.parse(rawData)));
  } catch (error) {
    return new Map();
  }
}

function saveClaims(claimsMap) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(claimsMap), null, 2), 'utf8');
  } catch (error) {
    console.error('Error guardando claims:', error);
  }
}

const activeClaims = loadClaims();

// Genera el Embed con la lista visual de claims
function buildClaimsEmbed() {
  const now = Date.now();
  const activeList = [];

  activeClaims.forEach((claim, id) => {
    if (claim.expiresAt > now) {
      const expireTimestamp = Math.floor(claim.expiresAt / 1000);
      activeList.push(`• **[${id}] ${claim.caveName}** — <@${claim.userId}> | Expira: <t:${expireTimestamp}:R>`);
    } else {
      activeClaims.delete(id);
    }
  });

  saveClaims(activeClaims);

  return new EmbedBuilder()
    .setColor(activeList.length > 0 ? '#00FF00' : '#FF0000')
    .setTitle('📜 RESPAWNS RECLAMADOS EN VIVO')
    .setDescription(
      activeList.length > 0 
        ? activeList.join('\n\n') 
        : '🟢 **Todas las cuevas están libres actualmente.**'
    )
    .setFooter({ text: 'Actualizado automáticamente' })
    .setTimestamp();
}

// Reenvía el dashboard al final del canal para que NUNCA se pierda arriba
async function refreshChannelDashboard() {
  const channelId = process.env.CLAIMS_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    // Buscar y borrar mensajes viejos del bot para mantener limpio el canal
    const messages = await channel.messages.fetch({ limit: 15 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    
    for (const [, msg] of botMessages) {
      await msg.delete().catch(() => {});
    }

    // Enviar el nuevo embed al final del chat
    await channel.send({ embeds: [buildClaimsEmbed()] });
  } catch (err) {
    console.error('Error actualizando el canal:', err);
  }
}

const commands = [
  new SlashCommandBuilder().setName('claim').setDescription('Reclama una cueva por 2 horas').addStringOption(o => o.setName('id').setDescription('ID de la cueva').setRequired(true)),
  new SlashCommandBuilder().setName('unclaim').setDescription('Libera una cueva').addStringOption(o => o.setName('id').setDescription('ID de la cueva').setRequired(true)),
  new SlashCommandBuilder().setName('claims').setDescription('Muestra las cuevas ocupadas en este momento')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('clientReady', async () => {
  console.log(`🤖 Bot iniciado como: ${client.user.tag}`);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  await refreshChannelDashboard();
  
  // Limpieza y refresco cada 2 minutos
  setInterval(refreshChannelDashboard, 120000);
});
// Añade este comando dentro de la lista 'commands' en index.js:
new SlashCommandBuilder()
  .setName('ayuda')
  .setDescription('Muestra la guía de uso y comandos del bot de claims')

// Y añade este bloque dentro del evento 'interactionCreate':
if (commandName === 'ayuda') {
  const helpEmbed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('📖 GUÍA DE USO - BOT DE RESPAWNS')
    .setDescription('Sistema de organización de cuevas para Tibia.')
    .addFields(
      { 
        name: '🛠️ Comandos Disponibles', 
        value: '`/claim [id]` - Reclama una cueva por 2 horas.\n`/unclaim [id]` - Libera tu cueva antes de tiempo.\n`/claims` - Actualiza y muestra las cuevas activas.\n`/ayuda` - Muestra este menú.' 
      },
      { 
        name: '📌 ¿Cómo buscar las numeraciones?', 
        value: 'Revisa el canal de texto correspondiente a la lista de cuevas para ver el número exacto (ejemplo: `123` para Kilmaresh Catacombs).' 
      }
    )
    .setFooter({ text: 'No Mercy Bot' });

  return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
}



client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'claim') {
    const id = interaction.options.getString('id').toLowerCase();
    const caveName = respawns[id];

    if (!caveName) {
      return interaction.reply({ content: `❌ ID **${id}** no válido.`, ephemeral: true });
    }

    const now = Date.now();
    const currentClaim = activeClaims.get(id);

    if (currentClaim && currentClaim.expiresAt > now) {
      const remainingMinutes = Math.ceil((currentClaim.expiresAt - now) / 60000);
      return interaction.reply({ 
        content: `⚠️ **[${id}] ${caveName}** ya está ocupada por <@${currentClaim.userId}> (${remainingMinutes}m restantes).`, 
        ephemeral: true 
      });
    }

    const expiresAt = now + (2 * 60 * 60 * 1000);
    activeClaims.set(id, { userId: interaction.user.id, caveName, expiresAt });
    saveClaims(activeClaims);

    await interaction.reply({ content: `✅ <@${interaction.user.id}> reclamó **[${id}] ${caveName}** por 2 horas.` });
    return refreshChannelDashboard();
  }

  if (commandName === 'unclaim') {
    const id = interaction.options.getString('id').toLowerCase();
    const currentClaim = activeClaims.get(id);

    if (!currentClaim || currentClaim.expiresAt <= Date.now()) {
      return interaction.reply({ content: `⚠️ La cueva **${id}** no está reclamada.`, ephemeral: true });
    }

    if (currentClaim.userId !== interaction.user.id) {
      return interaction.reply({ content: `❌ Solo <@${currentClaim.userId}> puede liberar esta cueva.`, ephemeral: true });
    }

    activeClaims.delete(id);
    saveClaims(activeClaims);

    await interaction.reply({ content: `🔓 <@${interaction.user.id}> liberó la cueva **[${id}] ${currentClaim.caveName}**.` });
    return refreshChannelDashboard();
  }

  if (commandName === 'claims') {
    // Muestra el resumen directamente al usuario y refresca la lista fija
    await interaction.reply({ embeds: [buildClaimsEmbed()] });
    return refreshChannelDashboard();
  }
});

client.login(process.env.DISCORD_TOKEN);
