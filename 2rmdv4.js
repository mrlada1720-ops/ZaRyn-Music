/**
 * Apple Music Scraper
 * Creator: IzzXd
 * Base: https://music.apple.com
 * Saluran: https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325
 * Note: pliss guys jangan di klaim 100% buatan lu, lu boleh kok modifikasi trs share lagi tapi tolong jangan ilangin header creator sama ch-nya
 */

const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const _p = ["fJMupwGtP5IrlSHzB608x3nEdfsErTvFeMd081GnP5Ap", "w3XyVqs9w32RI6cD+GrEeJYnpgT4PsEolCOiAao8xw=="];
const _k = [0x4d, 0xa1, 0x17, 0xc3, 0x62, 0x9e, 0x0b, 0xf4];

function _ld() {
    const raw = Buffer.from(_p.join(''), 'base64');
    const out = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ _k[i % _k.length];
    return out.toString('utf8');
}

function _hd() {
    try {
        const src = fs.readFileSync(__filename, 'utf8');
        const m = src.match(/^\s*\/\*\*[\s\S]*?\*\//);
        if (!m) return '';
        const keys = ['Creator:', 'Saluran:', 'Note:'];
        const lines = m[0].split('\n').map(l => l.replace(/^\s*\*?\s*/, '').replace(/\s+/g, ''));
        const pick = keys.map(k => lines.find(l => l.startsWith(k)));
        if (pick.some(x => !x)) return '';
        return crypto.createHash('sha256').update(pick.join('')).digest('hex');
    } catch (_) {
        return '';
    }
}

function _ck() {
    const h = _hd();
    if (!h || h !== _ld()) throw new Error('ctx invalid');
}

const WM = {
    Creator: 'IzzXd',
    Saluran: 'https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getHighResArtwork(url, size = 1200) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/\{w\}x\{h\}bb\.\{f\}/i, `${size}x${size}bb.jpg`)
        .replace(/\/\d+x\d+bb/i, `/${size}x${size}bb`)
        .replace(/\/\d+x\d+w/i, `/${size}x${size}w`)
        .replace(/\/\d+x\d+bf/i, `/${size}x${size}bf`);
}

function parseAppleUrl(input) {
    if (!input || typeof input !== 'string') return { type: 'unknown', id: '' };
    const str = input.trim();
    if (/^\d+$/.test(str)) return { type: 'song', id: str };

    const songParam = str.match(/[?&]i=(\d+)/i);
    if (songParam) return { type: 'song', id: songParam[1] };

    const songMatch = str.match(/\/song\/(?:[^/]+\/)?(\d+)/i);
    if (songMatch) return { type: 'song', id: songMatch[1] };

    const albumMatch = str.match(/\/album\/(?:[^/]+\/)?(\d+)/i);
    if (albumMatch) return { type: 'album', id: albumMatch[1] };

    const artistMatch = str.match(/\/artist\/(?:[^/]+\/)?(\d+)/i);
    if (artistMatch) return { type: 'artist', id: artistMatch[1] };

    const playlistMatch = str.match(/\/playlist\/(?:[^/]+\/)?(pl\.[a-zA-Z0-9]+)/i);
    if (playlistMatch) return { type: 'playlist', id: playlistMatch[1], url: str };

    return { type: 'query', id: str, query: str };
}

async function resolveFullAudio(artist, title) {
    try {
        const query = `${artist || ''} - ${title || ''}`.trim();
        const form = new FormData();
        form.append('url', query);
        form.append('g-recaptcha-response', '');

        const res = await fetch('https://spotidown.app/action', {
            method: 'POST',
            headers: { 'User-Agent': UA, 'Referer': 'https://spotidown.app/en7', 'Origin': 'https://spotidown.app' },
            body: form
        });
        if (!res.ok) return null;

        const cookies = [];
        res.headers.forEach((v, k) => {
            if (k.toLowerCase() === 'set-cookie') cookies.push(v.split(';')[0]);
        });

        const json = await res.json();
        if (!json || json.error || !json.data) return null;

        const $ = cheerio.load(json.data);
        const firstForm = $('form[name="submitspurl"]').first();
        if (!firstForm.length) return null;

        const dataVal = firstForm.find('input[name="data"]').val();
        const baseVal = firstForm.find('input[name="base"]').val() || '';
        const tokenVal = firstForm.find('input[name="token"]').val();
        if (!dataVal || !tokenVal) return null;

        let parsedMeta = {};
        try { parsedMeta = JSON.parse(Buffer.from(dataVal, 'base64').toString('utf8')); } catch (_) {}

        const trackForm = new FormData();
        trackForm.append('data', dataVal);
        trackForm.append('base', baseVal);
        trackForm.append('token', tokenVal);

        const trackRes = await fetch('https://spotidown.app/action/track', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Referer': 'https://spotidown.app/en7',
                'Origin': 'https://spotidown.app',
                'Cookie': cookies.join('; ')
            },
            body: trackForm
        });
        if (!trackRes.ok) return null;

        const trackJson = await trackRes.json();
        if (!trackJson || trackJson.error || !trackJson.data) return null;

        const $t = cheerio.load(trackJson.data);
        let mp3Url = null;
        $t('a.abutton').each((_, el) => {
            const txt = $t(el).text().toLowerCase();
            const href = $t(el).attr('href');
            if (txt.includes('mp3') && href && href.startsWith('http')) mp3Url = href;
        });

        if (mp3Url) {
            return {
                downloadUrl: mp3Url,
                duration: parsedMeta.duration || null,
                format: 'mp3',
                quality: '320kbps',
                isFullTrack: true
            };
        }
    } catch (_) {}
    return null;
}

async function search(query, entity = 'song', limit = 20) {
    _ck();
    const t0 = Date.now();
    if (!query) throw new Error('Query pencarian diperlukan');

    let itunesEntity = 'song';
    if (entity === 'album') itunesEntity = 'album';
    else if (entity === 'artist') itunesEntity = 'musicArtist';

    const res = await axios.get('https://itunes.apple.com/search', {
        params: { term: query, entity: itunesEntity, limit: String(limit || 20) },
        headers: { 'User-Agent': UA },
        timeout: 15000
    });

    const results = (res.data?.results || []).map(item => {
        const thumb = item.artworkUrl100 || item.artworkUrl60 || '';
        return {
            id: String(item.trackId || item.collectionId || item.artistId || ''),
            type: item.wrapperType || item.kind || itunesEntity,
            title: item.trackName || item.collectionName || item.artistName || '',
            artist: item.artistName || '',
            album: item.collectionName || '',
            genre: item.primaryGenreName || '',
            durationMs: item.trackTimeMillis || null,
            duration: item.trackTimeMillis ? `${Math.floor(item.trackTimeMillis / 60000)}:${String(Math.floor((item.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}` : null,
            releaseDate: item.releaseDate || '',
            thumbnail: getHighResArtwork(thumb, 600),
            artworkOriginal: getHighResArtwork(thumb, 1400),
            previewUrl: item.previewUrl || null,
            appleUrl: item.trackViewUrl || item.collectionViewUrl || item.artistViewUrl || ''
        };
    });

    return { ...WM, time: `${Date.now() - t0}ms`, status: true, query, entity: itunesEntity, total: results.length, results };
}

async function getSong(idOrUrl) {
    _ck();
    const t0 = Date.now();
    let parsed = parseAppleUrl(idOrUrl);
    let id = parsed.id;

    if (parsed.type === 'query' || (!id && typeof idOrUrl === 'string')) {
        const sRes = await search(idOrUrl, 'song', 1);
        const first = sRes.results?.[0];
        if (!first) throw new Error(`Lagu "${idOrUrl}" tidak ditemukan di Apple Music`);
        id = first.id;
    }
    if (!id || !/^\d+$/.test(id)) throw new Error('ID atau URL lagu Apple Music tidak valid');

    const res = await axios.get(`https://itunes.apple.com/lookup?id=${id}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
    });

    const track = res.data?.results?.[0];
    if (!track) throw new Error(`Lagu dengan ID ${id} tidak ditemukan`);

    const thumb = track.artworkUrl100 || track.artworkUrl60 || '';
    const fullAudio = await resolveFullAudio(track.artistName, track.trackName);
    const resolvedDuration = fullAudio?.duration || (track.trackTimeMillis ? `${Math.floor(track.trackTimeMillis / 60000)}:${String(Math.floor((track.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}` : null);

    return {
        ...WM,
        time: `${Date.now() - t0}ms`,
        status: true,
        data: {
            id: String(track.trackId || id),
            title: track.trackName || '',
            artist: track.artistName || '',
            artistId: String(track.artistId || ''),
            album: track.collectionName || '',
            albumId: String(track.collectionId || ''),
            trackNumber: track.trackNumber || 1,
            genre: track.primaryGenreName || '',
            releaseDate: track.releaseDate || '',
            durationMs: track.trackTimeMillis || null,
            duration: resolvedDuration,
            thumbnail: getHighResArtwork(thumb, 600),
            artworkHighRes: getHighResArtwork(thumb, 1400),
            artworkMax: getHighResArtwork(thumb, 3000),
            previewAudio: track.previewUrl || null,
            url: track.trackViewUrl || `https://music.apple.com/song/${id}`,
            download: {
                directStream: fullAudio ? fullAudio.downloadUrl : (track.previewUrl || null),
                format: fullAudio ? fullAudio.format : 'm4a-aac',
                quality: fullAudio ? fullAudio.quality : 'preview-128kbps',
                isFullTrack: Boolean(fullAudio && fullAudio.isFullTrack),
                note: fullAudio ? 'Full audio MP3 320kbps' : 'Preview audio 30s'
            }
        }
    };
}

async function getAlbum(idOrUrl) {
    _ck();
    const t0 = Date.now();
    const parsed = parseAppleUrl(idOrUrl);
    const id = parsed.id;
    if (!id || !/^\d+$/.test(id)) throw new Error('ID atau URL album Apple Music tidak valid');

    const res = await axios.get(`https://itunes.apple.com/lookup?id=${id}&entity=song`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
    });

    const items = res.data?.results || [];
    if (!items.length) throw new Error(`Album dengan ID ${id} tidak ditemukan`);

    const albumInfo = items.find(i => i.wrapperType === 'collection') || items[0];
    const tracks = items.filter(i => i.wrapperType === 'track');
    const thumb = albumInfo.artworkUrl100 || albumInfo.artworkUrl60 || '';

    return {
        ...WM,
        time: `${Date.now() - t0}ms`,
        status: true,
        data: {
            id: String(albumInfo.collectionId || id),
            title: albumInfo.collectionName || '',
            artist: albumInfo.artistName || '',
            artistId: String(albumInfo.artistId || ''),
            genre: albumInfo.primaryGenreName || '',
            releaseDate: albumInfo.releaseDate || '',
            copyright: albumInfo.copyright || '',
            trackCount: albumInfo.trackCount || tracks.length,
            thumbnail: getHighResArtwork(thumb, 600),
            coverHighRes: getHighResArtwork(thumb, 1400),
            url: albumInfo.collectionViewUrl || `https://music.apple.com/album/${id}`,
            tracks: tracks.map(t => ({
                id: String(t.trackId),
                trackNumber: t.trackNumber,
                title: t.trackName,
                artist: t.artistName,
                durationMs: t.trackTimeMillis,
                duration: t.trackTimeMillis ? `${Math.floor(t.trackTimeMillis / 60000)}:${String(Math.floor((t.trackTimeMillis % 60000) / 1000)).padStart(2, '0')}` : null,
                previewAudio: t.previewUrl || null,
                url: t.trackViewUrl || ''
            }))
        }
    };
}

async function getArtist(idOrUrl) {
    _ck();
    const t0 = Date.now();
    const parsed = parseAppleUrl(idOrUrl);
    const id = parsed.id;
    if (!id || !/^\d+$/.test(id)) throw new Error('ID atau URL artis Apple Music tidak valid');

    const [artistRes, albumRes] = await Promise.all([
        axios.get(`https://itunes.apple.com/lookup?id=${id}`, { headers: { 'User-Agent': UA }, timeout: 15000 }),
        axios.get(`https://itunes.apple.com/lookup?id=${id}&entity=album&limit=25`, { headers: { 'User-Agent': UA }, timeout: 15000 })
    ]);

    const artist = artistRes.data?.results?.[0];
    if (!artist) throw new Error(`Artis dengan ID ${id} tidak ditemukan`);

    const albums = (albumRes.data?.results || [])
        .filter(i => i.wrapperType === 'collection')
        .map(a => {
            const thumb = a.artworkUrl100 || a.artworkUrl60 || '';
            return {
                id: String(a.collectionId),
                title: a.collectionName,
                trackCount: a.trackCount,
                genre: a.primaryGenreName,
                releaseDate: a.releaseDate,
                thumbnail: getHighResArtwork(thumb, 500),
                url: a.collectionViewUrl
            };
        });

    return {
        ...WM,
        time: `${Date.now() - t0}ms`,
        status: true,
        data: {
            id: String(artist.artistId || id),
            name: artist.artistName || '',
            genre: artist.primaryGenreName || '',
            artistType: artist.artistType || '',
            url: artist.artistLinkUrl || `https://music.apple.com/artist/${id}`,
            totalAlbums: albums.length,
            albums
        }
    };
}

async function getPlaylist(urlOrId) {
    _ck();
    const t0 = Date.now();
    let playlistUrl = String(urlOrId).trim();
    if (/^pl\.[a-zA-Z0-9]+$/i.test(playlistUrl)) {
        playlistUrl = `https://music.apple.com/us/playlist/${playlistUrl}`;
    }

    const res = await axios.get(playlistUrl, { headers: { 'User-Agent': UA }, timeout: 20000 });
    const $ = cheerio.load(res.data);
    const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text().trim();
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    let tracks = [];
    const rawData = $('script#serialized-server-data').text();
    if (rawData) {
        try {
            const json = JSON.parse(rawData);
            const dataArr = json?.data || [];
            for (const rootItem of dataArr) {
                const sections = rootItem?.data?.sections || [];
                for (const sec of sections) {
                    const items = sec?.items || [];
                    if (items.length > 5) {
                        tracks = items.map(t => {
                            const artDict = t.artwork?.dictionary || t.artwork;
                            let artUrl = artDict?.url || '';
                            if (artUrl) artUrl = artUrl.replace('{w}x{h}bb.{f}', '800x800bb.jpg');
                            const tid = (String(t.id || '').match(/(\d+)$/) || [])[1] || t.id;
                            return {
                                id: tid,
                                title: t.title || '',
                                artist: t.artistName || '',
                                trackNumber: t.trackNumber || null,
                                duration: t.duration || null,
                                artwork: artUrl || null,
                                previewAudio: t.previewUrl || t.audioPreviewUrl || null
                            };
                        });
                        break;
                    }
                }
            }
        } catch (_) {}
    }

    return {
        ...WM,
        time: `${Date.now() - t0}ms`,
        status: true,
        data: {
            title: ogTitle.replace(/ on Apple Music$/i, '').trim(),
            curator: 'Apple Music',
            description: ogDesc,
            thumbnail: getHighResArtwork(ogImage, 600),
            coverHighRes: getHighResArtwork(ogImage, 1400),
            url: playlistUrl,
            totalTracks: tracks.length,
            tracks
        }
    };
}

async function bulkDownload(idOrUrl) {
    _ck();
    return await getAlbum(idOrUrl);
}

async function download(idOrUrl) {
    _ck();
    const parsed = parseAppleUrl(idOrUrl);
    if (parsed.type === 'album') return await bulkDownload(idOrUrl);
    return await getSong(idOrUrl);
}

module.exports = {
    search,
    song: getSong,
    track: getSong,
    album: getAlbum,
    artist: getArtist,
    playlist: getPlaylist,
    download,
    dl: download,
    bulkDownload,
    downloadAll: bulkDownload
};

async function main() {
    const args = process.argv.slice(2);
    const action = (args[0] || '').toLowerCase();
    const param1 = args[1];
    const param2 = args[2];

    if (!action || action === '-h' || action === '--help') {
        console.log('Usage:');
        console.log(' node applemusic.js search <query> [type: song|album|artist]');
        console.log(' node applemusic.js song <id_or_url>');
        console.log(' node applemusic.js album <id_or_url>');
        console.log(' node applemusic.js artist <id_or_url>');
        console.log(' node applemusic.js playlist <playlist_url>');
        console.log(' node applemusic.js dl <id_or_url>');
        process.exit(1);
    }

    try {
        let result;
        if (action === 'search' || action === 's') {
            if (!param1) throw new Error('Query pencarian diperlukan');
            result = await search(args.slice(1).join(' '), param2 || 'song');
        } else if (action === 'song' || action === 'track') {
            if (!param1) throw new Error('ID atau URL lagu diperlukan');
            result = await getSong(param1);
        } else if (action === 'album') {
            if (!param1) throw new Error('ID atau URL album diperlukan');
            result = await getAlbum(param1);
        } else if (action === 'artist') {
            if (!param1) throw new Error('ID atau URL artis diperlukan');
            result = await getArtist(param1);
        } else if (action === 'playlist' || action === 'pl') {
            if (!param1) throw new Error('URL playlist Apple Music diperlukan');
            result = await getPlaylist(param1);
        } else if (action === 'dl' || action === 'download') {
            if (!param1) throw new Error('ID atau URL lagu diperlukan');
            result = await download(args.slice(1).join(' '));
        } else {
            result = await search(args.join(' '));
        }

        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.log(JSON.stringify({
            ...WM,
            time: '0ms',
            status: false,
            error: err.message || 'Terjadi kesalahan pada Apple Music Scraper'
        }, null, 2));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}