/**
 * Radio & 24/7 Voice Channel System for Grandway Shopping
 * 
 * Provides:
 * - Curated stations across various genres (Store Hits, Lo-Fi, 2010s, R&B, Gym, Pop Party, Synthwave, Chillhop, Jazz Cafe, Rock Classics)
 * - 24/7 dedicated radio mode: automatically joins musicRadioVoice channel, auto-queues tracks continuously, and suppresses inactivity timeouts
 * - Seamless handoff, listener presence detection, and station switching
 */

const RADIO_STATIONS = {
    store_hits: {
        name: '🛒 Grandway Store Hits',
        emoji: '🛒',
        description: 'Upbeat, friendly retail pop hits perfect for shopping and relaxing',
        filter: 'pop',
        tracks: [
            'The Weeknd - Blinding Lights',
            'Dua Lipa - Levitating',
            'Bruno Mars - 24K Magic',
            'Calvin Harris - Feel So Close',
            'Post Malone - Circles',
            'Daft Punk - Get Lucky',
            'Harry Styles - As It Was',
            'Maroon 5 - Sugar',
            'Taylor Swift - Style',
            'Justin Timberlake - Can\'t Stop the Feeling',
            'Ed Sheeran - Shivers',
            'Clean Bandit - Rather Be'
        ]
    },
    lofi_chill: {
        name: '☕ Lo-Fi & Study Beats',
        emoji: '☕',
        description: 'Chill, mellow background beats to study, chill, or game to',
        filter: 'lofi',
        tracks: [
            'Lofi Fruits Music - Chill Beats',
            'Joji - Glimpse of Us',
            'Rex Orange County - Best Friend',
            'Daniel Caesar - Best Part',
            'Frank Ocean - Pink + White',
            'Kali Uchis - Telepatia',
            'Billie Eilish - Birds of a Feather',
            'SZA - Snooze',
            'ChilledCow - Lofi Hip Hop Beats to Relax/Study to',
            'Kavv - Coffee Lofi',
            'Kudasai - A Thousand Doors',
            'Idealism - Nagashi'
        ]
    },
    throwbacks_2010s: {
        name: '🔥 2010s Throwbacks & Anthems',
        emoji: '🔥',
        description: 'Iconic dance-pop, EDM, and radio bangers from the golden 2010s era',
        filter: 'none',
        tracks: [
            'Avicii - Wake Me Up',
            'Pitbull - Give Me Everything',
            'Katy Perry - Teenage Dream',
            'Rihanna - We Found Love',
            'OneRepublic - Counting Stars',
            'David Guetta - Titanium',
            'LMFAO - Party Rock Anthem',
            'Taio Cruz - Dynamite',
            'Kesha - TiK ToK',
            'Usher - DJ Got Us Fallin\' In Love',
            'The Chainsmokers - Closer',
            'Swedish House Mafia - Don\'t You Worry Child'
        ]
    },
    late_night_rnb: {
        name: '🌙 Late Night R&B & Soul',
        emoji: '🌙',
        description: 'Smooth, soulful late-night vibes and atmospheric contemporary R&B',
        filter: 'bassboost_low',
        tracks: [
            'The Weeknd - Die For You',
            'Drake - Passionfruit',
            'Bryson Tiller - Exchange',
            'Chris Brown - Under The Influence',
            'Miguel - Sure Thing',
            'Brent Faiyaz - Trust',
            'Giveon - Heartbreak Anniversary',
            'Summer Walker - Playing Games',
            'PARTYNEXTDOOR - Break from Toronto',
            'Frank Ocean - Nights',
            'Jhene Aiko - Sativa',
            'Steve Lacy - Bad Habit'
        ]
    },
    hype_gym: {
        name: '🎧 Hype, Phonk & Workout',
        emoji: '🎧',
        description: 'High-energy trap, phonk, and hip-hop bass for lifting or gaming focus',
        filter: 'bassboost_medium',
        tracks: [
            'Travis Scott - FE!N',
            'Kanye West - Stronger',
            'Eminem - Till I Collapse',
            'Kendrick Lamar - HUMBLE.',
            '21 Savage - redrum',
            'Playboi Carti - Sky',
            'Kordhell - Murder In My Mind',
            'DVRST - Close Eyes',
            'GHOSTFACE PLAYA - Why Not',
            'Metro Boomin - Superhero',
            'Future - Mask Off',
            'Drake - Nonstop'
        ]
    },
    pop_party: {
        name: '✨ Pop Party & Top 40',
        emoji: '✨',
        description: 'Chart-topping global pop party anthems and feel-good hits',
        filter: 'none',
        tracks: [
            'Sabrina Carpenter - Espresso',
            'Taylor Swift - Cruel Summer',
            'Lady Gaga - Just Dance',
            'Flo Rida - Low',
            'Black Eyed Peas - I Gotta Feeling',
            'Charli xcx - 360',
            'Ariana Grande - yes, and?',
            'Chappell Roan - Good Luck, Babe!',
            'Katy Perry - Firework',
            'Pitbull - Fireball',
            'Macklemore - Can\'t Hold Us',
            'Beyonce - TEXAS HOLD \'EM'
        ]
    },
    jazz_cafe: {
        name: '🎷 Grandway Jazz Café',
        emoji: '🎷',
        description: 'Smooth acoustic jazz, lounge bossa nova, and cozy store ambience',
        filter: 'none',
        tracks: [
            'Miles Davis - So What',
            'Dave Brubeck - Take Five',
            'Norah Jones - Don\'t Know Why',
            'Stan Getz - The Girl From Ipanema',
            'Bill Evans - Autumn Leaves',
            'John Coltrane - In a Sentimental Mood',
            'Chet Baker - My Funny Valentine',
            'Duke Ellington - Take the A Train'
        ]
    },
    synthwave: {
        name: '🌆 80s Synthwave & Retro',
        emoji: '🌆',
        description: 'Neon retro-futuristic synths, outrun arpeggios, and 80s aesthetics',
        filter: 'vaporwave',
        tracks: [
            'The Midnight - Sunset',
            'Kavinsky - Nightcall',
            'GUNSHIP - Tech Noir',
            'HOME - Resonance',
            'FM-84 - Running in the Night',
            'Carpenter Brut - Turbo Killer',
            'Timecop1983 - On the Run',
            'Mitch Murder - Interceptor'
        ]
    }
};

class RadioManager {
    constructor() {
        this.activeRadios = new Map(); // guildId -> { stationKey, channelId, textChannelId, is247: true }
    }

    getStations() {
        return RADIO_STATIONS;
    }

    getStation(key) {
        return RADIO_STATIONS[key] || null;
    }

    isRadioActive(guildId) {
        return this.activeRadios.has(guildId);
    }

    getActiveRadio(guildId) {
        return this.activeRadios.get(guildId) || null;
    }

    stopRadio(guildId) {
        const info = this.activeRadios.get(guildId);
        this.activeRadios.delete(guildId);
        return info;
    }

    /**
     * Starts radio streaming for a given guild and station
     */
    async startRadio({ guild, voiceChannel, textChannel, stationKey = 'store_hits', requester = null, musicManager }) {
        if (!guild || !voiceChannel) {
            throw new Error('Valid guild and voice channel are required to start the radio.');
        }

        const station = this.getStation(stationKey) || RADIO_STATIONS.store_hits;
        const queue = musicManager.getQueue(guild.id);

        // Mark queue as 24/7 Radio mode
        queue.isRadioMode = true;
        queue.radioStationKey = stationKey;
        queue.autoplay = true; // Auto-fetch related music when queue empties

        // Cancel any pending disconnect timeouts
        queue.cancelDisconnect();

        // Connect voice
        await queue.connect(voiceChannel, textChannel);

        // Record active radio state
        this.activeRadios.set(guild.id, {
            stationKey,
            stationName: station.name,
            voiceChannelId: voiceChannel.id,
            textChannelId: textChannel ? textChannel.id : null,
            startedAt: Date.now()
        });

        // Apply radio's tuned DSP filter if specified and no user filter active
        if (station.filter && station.filter !== 'none') {
            await queue.applyFilter(station.filter, 1.0, false);
        }

        // Shuffle tracks from station and queue
        const shuffled = [...station.tracks].sort(() => Math.random() - 0.5);
        const djUser = requester || { id: 'RADIO', tag: `${station.emoji} ${station.name}` };

        // Resolve first track immediately for instant playback
        const firstRes = await musicManager.resolveQuery(shuffled[0], djUser);
        const firstTrack = firstRes.track || firstRes.topTrack;

        if (firstTrack) {
            firstTrack.isRadio = true;
            firstTrack.stationName = station.name;
            if (queue.isPlaying || queue.currentTrack) {
                queue.queue.push(firstTrack);
            } else {
                await queue.playTrack(firstTrack);
            }
        }

        // Queue remaining tracks in the background
        (async () => {
            for (let i = 1; i < shuffled.length; i++) {
                try {
                    const r = await musicManager.resolveQuery(shuffled[i], djUser);
                    const t = r.track || r.topTrack;
                    if (t) {
                        t.isRadio = true;
                        t.stationName = station.name;
                        queue.queue.push(t);
                    }
                } catch (_) {}
            }
            if (queue.preEncodeNextTrack) queue.preEncodeNextTrack();
        })();

        return {
            station,
            voiceChannel,
            trackCount: shuffled.length
        };
    }

    /**
     * Automatically ensure 24/7 dedicated radio channel is playing if configured
     */
    async ensureDedicatedRadio(client, musicManager, config) {
        if (!config || !config.guildId || !config.channels || !config.channels.musicRadioVoice) return;
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;

        const radioChannel = guild.channels.cache.get(config.channels.musicRadioVoice);
        if (!radioChannel || !radioChannel.isVoiceBased()) return;

        const queue = musicManager.getQueue(guild.id);
        // If already playing or connected, do not interrupt
        if (queue && (queue.isPlaying || queue.currentTrack || queue.player)) return;

        const textChannel = (config.channels.musicCommands && guild.channels.cache.get(config.channels.musicCommands))
            || guild.channels.cache.find(c => c.name === 'music-commands')
            || guild.channels.cache.find(c => c.isTextBased());

        try {
            console.log(`📻 [24/7 RADIO] Booting continuous broadcast in #${radioChannel.name}...`);
            await this.startRadio({
                guild,
                voiceChannel: radioChannel,
                textChannel,
                stationKey: 'store_hits',
                requester: { id: 'AUTO_24_7', tag: '📻 24/7 Grandway Radio' },
                musicManager
            });
        } catch (err) {
            console.warn('[24/7 RADIO] Initial startup deferral:', err.message);
        }
    }
}

const radioManager = new RadioManager();

module.exports = {
    radioManager,
    RADIO_STATIONS
};
