require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const respawns = require('./respawns');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const activeClaims = new Map(); // Guarda las cuevas reclamadas en memoria

// Definición de Comandos Slash
const commands = [
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Reclama una cueva por 2 horas')
    .addStringOption(option => 
      option.setName('id')
        .setDescription('ID de la cueva (ej: 123)')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Libera una cueva que tengas reclamada')
    .addStringOption(option => 
      option.setName('id')
        .setDescription('ID de la cueva a liberar')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('claims')
    .setDescription('Muestra la lista de cuevas ocupadas actualmente')
].map(command => command.toJSON());

// Registrar comandos Slash
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🤖 Bot iniciado como: ${client.user.tag}`);
  try {
    console.log('Cargando comandos slash...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Comandos registrados con éxito.');
  } catch (error) {
    console.error('Error al registrar comandos:', error);
  }
});

// Manejo de Interacciones
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'claim') {
    const id = interaction.options.getString('id').toLowerCase();
    const caveName = respawns[id];

    if (!caveName) {
      return interaction.reply({ content: `❌ El ID **${id}** no existe en la lista de respawns.`, ephemeral: true });
    }

    const now = Date.now();
    const currentClaim = activeClaims.get(id);

    // Verificar si la cueva está ocupada y si el reclamo aún no ha expirado
    if (currentClaim && currentClaim.expiresAt > now) {
      const remainingMinutes = Math.ceil((currentClaim.expiresAt - now) / (1000 * 60));
      return interaction.reply({ 
        content: `⚠️ La cueva **[${id}] ${caveName}** está ocupada por <@${currentClaim.userId}>. Tiempo restante: **${remainingMinutes} minutos**.`, 
        ephemeral: true 
      });
    }

    // Registrar reclamo de 2 horas (2 * 60 * 60 * 1000 ms)
    const durationMs = 2 * 60 * 60 * 1000;
    const expiresAt = now + durationMs;
    
    activeClaims.set(id, {
      userId: interaction.user.id,
      userName: interaction.user.username,
      caveName: caveName,
      expiresAt: expiresAt
    });

    const expireTimestamp = Math.floor(expiresAt / 1000);

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('🎯 Respawn Reclamado')
      .setDescription(`**${interaction.user.username}** ha reclamado **[${id}] ${caveName}**`)
      .addFields({ name: 'Expira en:', value: `<t:${expireTimestamp}:R> (<t:${expireTimestamp}:t>)` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'unclaim') {
    const id = interaction.options.getString('id').toLowerCase();
    const currentClaim = activeClaims.get(id);

    if (!currentClaim || currentClaim.expiresAt <= Date.now()) {
      return interaction.reply({ content: `⚠️ La cueva **${id}** no está ocupada actualmente.`, ephemeral: true });
    }

    if (currentClaim.userId !== interaction.user.id) {
      return interaction.reply({ content: `❌ Solo el usuario <@${currentClaim.userId}> puede liberar esta cueva.`, ephemeral: true });
    }

    activeClaims.delete(id);
    return interaction.reply(`🔓 La cueva **[${id}] ${currentClaim.caveName}** ha sido liberada por <@${interaction.user.id}>.`);
  }

  if (commandName === 'claims') {
    const now = Date.now();
    const activeList = [];

    activeClaims.forEach((claim, id) => {
      if (claim.expiresAt > now) {
        const expireTimestamp = Math.floor(claim.expiresAt / 1000);
        activeList.push(`• **[${id}] ${claim.caveName}** — <@${claim.userId}> (Expira: <t:${expireTimestamp}:R>)`);
      } else {
        activeClaims.delete(id);
      }
    });

    if (activeList.length === 0) {
      return interaction.reply('ℹ️ No hay cuevas reclamadas en este momento.');
    }

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📜 Cuevas Reclamadas Actualmente')
      .setDescription(activeList.join('\n'))
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);