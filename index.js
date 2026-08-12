require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const respawns = require('./respawns');

// --- SERVIDOR WEB DUMMY PARA ENGAÑAR A RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Bot de Discord está online y funcionando correctamente.');
});

app.listen(PORT, () => {
  console.log(`🌐 Servidor web escuchando en el puerto ${PORT} para mantener Render activo.`);
});
// --------------------------------------------------

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
    console.error('Error al guardar claims:', error);
  }
}

const activeClaims = loadClaims();

async function updateDashboard() {
  const channelId = process.env.CLAIMS_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    const now = Date.now();
    const activeList = [];

    activeClaims.forEach((claim, id) => {
      if (claim.expiresAt > now) {
        const expireTimestamp = Math.floor(claim.expiresAt / 1000);
        activeList.push(`• **[${id}] ${claim.caveName}** — <@${claim.userId}> (Expira <t:${expireTimestamp}:R>)`);
      } else {
        activeClaims.delete(id);
      }
    });

    saveClaims(activeClaims);

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📌 ESTADO DE RESPAWNS EN VIVO')
      .setDescription(activeList.length > 0 ? activeList.join('\n') : '*No hay cuevas reclamadas en este momento.*')
      .setTimestamp();

    const messages = await channel.messages.fetch({ limit: 10 });
    const botMessage = messages.find(m => m.author.id === client.user.id);

    if (botMessage) {
      await botMessage.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Error al actualizar dashboard:', err);
  }
}

const commands = [
  new SlashCommandBuilder().setName('claim').setDescription('Reclama una cueva por 2 horas').addStringOption(o => o.setName('id').setDescription('ID de la cueva').setRequired(true)),
  new SlashCommandBuilder().setName('unclaim').setDescription('Libera una cueva').addStringOption(o => o.setName('id').setDescription('ID de la cueva').setRequired(true)),
  new SlashCommandBuilder().setName('claims').setDescription('Muestra las cuevas ocupadas')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('clientReady', async () => {
  console.log(`🤖 Bot iniciado como: ${client.user.tag}`);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  updateDashboard();
  setInterval(updateDashboard, 60000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'claim') {
    const id = interaction.options.getString('id').toLowerCase();
    const caveName = respawns[id];

    if (!caveName) return interaction.reply({ content: `❌ ID **${id}** no válido.`, ephemeral: true });

    const now = Date.now();
    const currentClaim = activeClaims.get(id);

    if (currentClaim && currentClaim.expiresAt > now) {
      const remainingMinutes = Math.ceil((currentClaim.expiresAt - now) / 60000);
      return interaction.reply({ content: `⚠️ **[${id}] ${caveName}** ocupada por <@${currentClaim.userId}> (${remainingMinutes}m restantes).`, ephemeral: true });
    }

    const expiresAt = now + (2 * 60 * 60 * 1000);
    activeClaims.set(id, { userId: interaction.user.id, caveName, expiresAt });
    saveClaims(activeClaims);
    await updateDashboard();

    const expireTimestamp = Math.floor(expiresAt / 1000);
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎯 Respawn Reclamado')
        .setDescription(`**${interaction.user.username}** reclamó **[${id}] ${caveName}**`)
        .addFields({ name: 'Expira en:', value: `<t:${expireTimestamp}:R>` })
    ] });
  }

  if (commandName === 'unclaim') {
    const id = interaction.options.getString('id').toLowerCase();
    const currentClaim = activeClaims.get(id);

    if (!currentClaim || currentClaim.expiresAt <= Date.now()) return interaction.reply({ content: `⚠️ Cueva no ocupada.`, ephemeral: true });
    if (currentClaim.userId !== interaction.user.id) return interaction.reply({ content: `❌ Solo <@${currentClaim.userId}> puede liberarla.`, ephemeral: true });

    activeClaims.delete(id);
    saveClaims(activeClaims);
    await updateDashboard();

    return interaction.reply(`🔓 **[${id}] ${currentClaim.caveName}** liberada por <@${interaction.user.id}>.`);
  }

  if (commandName === 'claims') {
    await updateDashboard();
    return interaction.reply({ content: '✅ Lista de claims actualizada en el canal asignado.', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);