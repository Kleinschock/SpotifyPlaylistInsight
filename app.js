// --- IMPORTANT NOTE ON USER ACCESS ---
// By default, your Spotify Application is in "Development Mode". This means
// only the Spotify account that created the app can use it.
// To allow other users (like friends) to use your visualizer, you must either:
// 1. Go to your Spotify Developer Dashboard (developer.spotify.com/dashboard),
//    select your application, go to "Users and Access", and add their
//    Spotify email and full name to the list. You can add up to 25 users.
// 2. Or, for public access, you must apply for a "Quota Extension" from Spotify
//    through the dashboard to take your app out of Development Mode.

// --- Configuration ---
const CLIENT_ID = '732dc1eab09c4120945541da8f197de8'; // Your Spotify Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname;
const LASTFM_API_KEY = '0d01968c9827680d5686e7bb324fc8e8'; // Your Last.fm API Key
const LASTFM_API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_API_DELAY = 210; // Milliseconds between Last.fm calls (approx 5/sec limit)

// --- State Variables ---
let spotifyAccessToken = null;
let currentPlaylistData = null;
let activeGenreSource = 'spotify'; // 'spotify' or 'lastfm'
let activeTrackGenreSource = 'spotify'; // 'spotify', 'lastfm', or 'both'
let currentGenreFilter = null;
let chartInstances = {}; // Store chart instances { pie, bar, year, artists }
let lastFmApiCallTimestamp = 0; // For rate limiting

// --- DOM Elements ---
const loginButton = document.getElementById('login-button');
const analyzeButton = document.getElementById('analyze-button');
const playlistInput = document.getElementById('playlist-input');
const loginContainer = document.getElementById('login-container');
const instructionsSection = document.getElementById('instructions');
const playlistContainer = document.getElementById('playlist-container');
const resultsContainer = document.getElementById('results-container');
const initialLoadingOverlay = document.getElementById('initial-loading-overlay');
const resultsSkeletonLoader = document.getElementById('results-skeleton-loader');
const resultsActualContent = document.getElementById('results-actual-content');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
const genreSourceButtons = document.querySelectorAll('.toggle-button[data-source]');
const trackGenreSourceRadios = document.querySelectorAll('input[name="trackGenreSource"]');

// Specific Feature Elements
const similarArtistsContainer = document.getElementById('similar-artists-container');
const similarArtistsButtonsPlaceholder = document.getElementById('similar-artists-buttons');
const similarArtistsResultsPanel = document.getElementById('similar-artists-results');
const similarArtistsListDiv = document.getElementById('similar-artists-list');

const genreRadioButtonsContainer = document.getElementById('genre-radio-buttons');
const genreRadioResultsPanel = document.getElementById('genre-radio-results');
const genreRadioListDiv = document.getElementById('genre-radio-list');
const selectedGenreRadioSpan = document.getElementById('selected-genre-radio');
const pieChartTitle = document.getElementById('genre-pie-chart-title');
const barChartTitle = document.getElementById('genre-bar-chart-title');
const filterNoticeContainer = document.getElementById('filter-notice-container');
const totalTracksEl = document.getElementById('total-tracks');
const totalDurationEl = document.getElementById('total-duration');
const uniqueArtistsEl = document.getElementById('unique-artists');
const uniqueGenresEl = document.getElementById('unique-genres');
const topArtistsListContainer = document.getElementById('top-artists-list');
const topArtistCountEl = document.getElementById('top-artist-count');


// --- UI & Utilities ---

function replaceFeatherIcons() {
    if (typeof feather !== 'undefined') {
        try { feather.replace(); } catch (e) { console.error("Feather icons error:", e); }
    } else {
        console.warn("Feather icons script not loaded or executed yet.");
    }
}

function setupIntersectionObserver() {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    };
    const observer = new IntersectionObserver(observerCallback, observerOptions);
    document.querySelectorAll('.animate-on-scroll').forEach(target => {
        target.classList.remove('is-visible'); // Reset before observing
        observer.observe(target);
    });
}

function showSkeletonLoader(show) {
    if (!resultsSkeletonLoader || !resultsActualContent) return;
    if (show) {
        resultsSkeletonLoader.classList.remove('hidden');
        resultsActualContent.classList.add('hidden');
        resultsContainer.classList.remove('hidden');
    } else {
        resultsSkeletonLoader.classList.add('hidden');
        resultsActualContent.classList.remove('hidden');
        setTimeout(() => {
            replaceFeatherIcons();
            setupIntersectionObserver();
        }, 100);
    }
}

function updateFooterYear() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function showLoading(show, message = "Processing...") {
    if (show) {
        console.log("Loading:", message);
    } else {
        console.log("Loading finished.");
    }
}


function showError(message, isWarning = false) {
    apiErrorDiv.textContent = message;
    apiErrorDiv.className = isWarning ? 'error-message warning' : 'error-message error';
    apiErrorDiv.classList.remove('hidden');
}

function clearError() {
     apiErrorDiv.classList.add('hidden'); apiErrorDiv.textContent = '';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout); timeout = setTimeout(later, wait);
    };
}

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) { text += possible.charAt(Math.floor(Math.random() * possible.length)); }
    return text;
}

// --- Spotify Authentication ---
function handleAuthentication() {
    const tokenFromStorage = sessionStorage.getItem('spotify_access_token');
    const expiryTime = sessionStorage.getItem('spotify_token_expiry');
    const tokenFromUrl = getAccessTokenFromUrl();

    if (tokenFromUrl) {
        spotifyAccessToken = tokenFromUrl.token;
        const expires_in = tokenFromUrl.expires_in;
        sessionStorage.setItem('spotify_access_token', spotifyAccessToken);
        sessionStorage.setItem('spotify_token_expiry', Date.now() + expires_in * 1000);
        history.pushState("", document.title, window.location.pathname + window.location.search);
    } else if (tokenFromStorage && expiryTime && Date.now() < expiryTime) {
        spotifyAccessToken = tokenFromStorage;
    } else {
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_token_expiry');
        spotifyAccessToken = null;
    }
    updateLoginState();
    if(initialLoadingOverlay) initialLoadingOverlay.classList.add('hidden');
}
function updateLoginState() {
     if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        instructionsSection.classList.remove('hidden');
        setTimeout(setupIntersectionObserver, 50);
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
        instructionsSection.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
    }
     replaceFeatherIcons();
}
function redirectToSpotifyLogin() {
    const scope = 'playlist-read-private playlist-read-collaborative';
    const state = generateRandomString(16);
    sessionStorage.setItem('spotify_auth_state', state);
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);
    window.location.href = authUrl.toString();
}
function getAccessTokenFromUrl() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const state = params.get('state');
    const storedState = sessionStorage.getItem('spotify_auth_state');
    const expires_in = params.get('expires_in');
    if (token && state && state === storedState && expires_in) {
        sessionStorage.removeItem('spotify_auth_state');
        return { token, expires_in: parseInt(expires_in, 10) };
    }
    if (window.location.hash) {
         history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    return null;
}
function logout() {
    spotifyAccessToken = null;
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    updateLoginState();
    resultsContainer.classList.add('hidden');
    playlistInput.value = '';
}

// --- API Fetching ---
async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        showError("Authentication required. Please log in again.");
        logout();
        return null;
    }
    const url = `https://api.spotify.com/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null
        });
        if (response.status === 401) {
            showError("Your session has expired. Please log in again.");
            logout();
            return null;
        }
        if (response.status === 429) {
             const retryAfterSeconds = parseInt(response.headers.get('Retry-After') || '5', 10);
             showError(`Rate limit hit. Retrying in ${retryAfterSeconds}s...`, true);
             await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
             return fetchSpotifyAPI(endpoint, method, body);
        }
        const responseData = await response.json().catch(() => null);

        if (!response.ok) {
            const errorMessage = responseData?.error?.message || response.statusText || `HTTP Error ${response.status}`;
            showError(`Spotify Error: ${errorMessage}`);
            return null;
        }
        return responseData;
    } catch (error) {
        showError("Network error connecting to Spotify. Please check your connection.");
        return null;
    }
}
async function lastFmRateLimiter() {
    const now = Date.now();
    const timeSinceLastCall = now - lastFmApiCallTimestamp;
    if (timeSinceLastCall < LASTFM_API_DELAY) {
        const delayNeeded = LASTFM_API_DELAY - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    lastFmApiCallTimestamp = Date.now();
}
async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    await lastFmRateLimiter();

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            if (data.error !== 6) {
                 console.error(`Last.fm API Error ${data.error}: ${data.message}`, params);
                 showError(`Last.fm Error (${params.method}): ${data.message}`, true);
            } else {
                 console.log(`Last.fm Info (${params.method}): ${data.message}`);
            }
            return null;
        }
        if (!response.ok) {
             showError(`Last.fm Error: ${response.statusText || 'Unknown error'}`, true);
             return null;
        }
        return data;
    } catch (error) {
        showError("Network error connecting to Last.fm. Please check your connection.", true);
        return null;
    }
}

// --- Data Processing ---
function extractPlaylistId(input) {
    try {
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input);
            const pathParts = url.pathname.split('/');
            const idIndex = pathParts.indexOf('playlist');
            if (idIndex !== -1 && pathParts.length > idIndex + 1) {
                return pathParts[idIndex + 1].split('?')[0];
            }
        }
        else if (input.startsWith('spotify:playlist:')) {
            return input.split(':')[2];
        }
        else if (/^[a-zA-Z0-9]{22}$/.test(input)) {
            return input;
        }
    } catch (e) {
        showError("Could not parse the provided playlist input. Please use a valid URL or ID.");
    }
    return null;
}
async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,popularity,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next&limit=50`;
    const maxTracks = 1000;

    showLoading(true, "Fetching playlist tracks...");
    let page = 1;

    while (url && tracks.length < maxTracks) {
        showLoading(true, `Fetching track page ${page}...`);
        const data = await fetchSpotifyAPI(url);
        if (!data) {
             showError("Failed to fetch tracks (authentication issue or API error). Analysis stopped.");
             return null;
        }
        if (!data.items || data.items.length === 0) break;

        const validItems = data.items.filter(item => item && item.track && item.track.id);
        tracks = tracks.concat(validItems);
        url = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
        page++;
        if (url) await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (tracks.length >= maxTracks) {
        showError(`Playlist contains more than ${maxTracks} tracks. Analysis limited to the first ${maxTracks}.`, true);
    }

    showLoading(false);
    return tracks;
}
async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)];
    const artistDetails = {};
    const batchSize = 50;
    const totalArtists = uniqueArtistIds.length;

    console.log(`Fetching details for ${totalArtists} unique artists...`);

    showLoading(true, `Fetching Spotify details...`);
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const endpoint = `artists?ids=${batchIds.join(',')}`;
        const data = await fetchSpotifyAPI(endpoint);
        if (data?.artists) {
            data.artists.forEach(artist => {
                if (artist) {
                    artistDetails[artist.id] = {
                        name: artist.name,
                        spotifyGenres: artist.genres || [],
                        imageUrl: artist.images?.find(img => img.width >= 50 && img.width <= 300)?.url || artist.images?.[1]?.url || artist.images?.[0]?.url || null,
                        lastFmTags: [],
                        spotifyUrl: artist.external_urls?.spotify
                    };
                }
            });
        } else if (!data && !spotifyAccessToken) return null;
        if (i + batchSize < totalArtists) await new Promise(resolve => setTimeout(resolve, 50));
    }

    showLoading(true, `Fetching Last.fm tags...`);
    for (const artistId of uniqueArtistIds) {
        if (!artistDetails[artistId] || !artistDetails[artistId].name) continue;
        const artistName = artistDetails[artistId].name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params);
        if (lastfmData?.toptags?.tag) {
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             artistDetails[artistId].lastFmTags = tags.slice(0, 10).map(tag => tag.name.toLowerCase().trim()).filter(Boolean);
        }
    }
    showLoading(false);
    return artistDetails;
}
function processPlaylistData(playlistInfo, tracks, artistDetails) {
    if (!tracks || tracks.length === 0) return {};
    
    const processedTracks = tracks.map(item => {
        const track = item.track;
        if (!track || !track.id || !track.artists || track.artists.length === 0 || !track.album) return null;

        let trackSpotifyGenres = new Set();
        let trackLastFmTags = new Set();
        track.artists.forEach(artist => {
            const details = artistDetails[artist.id];
            if (details) {
                details.spotifyGenres?.forEach(g => trackSpotifyGenres.add(g.toLowerCase().trim()));
                details.lastFmTags?.forEach(t => trackLastFmTags.add(t.toLowerCase().trim()));
            }
        });

        const primaryArtistDetails = artistDetails[track.artists[0].id];
        const releaseDate = track.album.release_date;
        let releaseYear = null;
        if (releaseDate) {
            releaseYear = parseInt(releaseDate.substring(0, 4), 10);
            if (isNaN(releaseYear) || releaseYear < 1900 || releaseYear > new Date().getFullYear() + 2) releaseYear = null;
        }

        const imageUrl = track.album.images?.find(img => img.width >= 50 && img.width <= 300)?.url || track.album.images?.[1]?.url || track.album.images?.[0]?.url || null;

        return {
            id: track.id, title: track.name, artist: track.artists.map(a => a.name).join(', '),
            primaryArtistName: primaryArtistDetails?.name || track.artists[0].name,
            album: track.album.name, imageUrl, spotifyUrl: track.external_urls?.spotify, releaseYear,
            durationMs: track.duration_ms, explicit: track.explicit, popularity: track.popularity,
            spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(),
            lastFmTags: [...trackLastFmTags].filter(Boolean).sort()
        };
    }).filter(Boolean);

    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');
    const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName));

    return {
        id: playlistInfo.id, name: playlistInfo.name,
        description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''),
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null,
        owner: playlistInfo.owner?.display_name || 'Unknown Owner',
        spotifyUrl: playlistInfo.external_urls?.spotify, tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`,
            uniqueArtists: uniqueArtistNames.size,
        },
        artistDetails
    };
}

// --- UI Display ---
function displayPlaylistInfo(playlistData) {
    const defaultImage = 'placeholder.png';
    const imageUrl = playlistData.imageUrl || defaultImage;

    playlistInfoDiv.innerHTML = `
        <img src="${imageUrl}" alt="${playlistData.name || 'Playlist'} cover art" loading="lazy" onerror="this.onerror=null;this.src='${defaultImage}';">
        <div class="playlist-details">
            <h3>${playlistData.name || 'Playlist Name'}</h3>
            <p>By ${playlistData.owner || 'Unknown Owner'}</p>
            ${playlistData.description ? `<p class="description">${playlistData.description}</p>` : ''}
            ${playlistData.spotifyUrl ? `
            <p><a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">
                <span data-feather="external-link" class="icon button-icon"></span>View on Spotify
            </a></p>` : ''}
        </div>`;
    totalTracksEl.textContent = playlistData.stats?.totalTracks ?? '-';
    totalDurationEl.textContent = playlistData.stats?.totalDurationFormatted ?? '-';
    uniqueArtistsEl.textContent = playlistData.stats?.uniqueArtists ?? '-';
    replaceFeatherIcons();
}
function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {};
    const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';

    if (!tracks || tracks.length === 0) {
        uniqueGenresEl.textContent = '0';
        return [];
    }

    tracks.forEach(track => {
        if (track && Array.isArray(track[key])) {
            track[key].forEach(genre => {
                if (genre) genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            });
        }
    });

    const sortedGenres = Object.entries(genreCounts).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count);
    uniqueGenresEl.textContent = sortedGenres.length;
    return sortedGenres;
}

// --- Chart Rendering ---
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) return;
    if (chartInstances[instanceKey]) chartInstances[instanceKey].destroy();
    try {
        chartInstances[instanceKey] = new Chart(ctx, { type: chartType, data, options });
    } catch (e) {
        showError(`Could not render the ${instanceKey} chart.`);
    }
}
function handleChartClick(event, elements, labels) {
     if (elements && elements.length > 0) {
        try {
            const genre = labels[elements[0].index];
            if (genre) filterTracksByGenre(genre);
        } catch (e) { console.error("Error handling chart click:", e); }
    }
}
function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) {
         if (chartInstances.year) chartInstances.year.destroy();
         document.getElementById('release-year-chart').style.display = 'none';
         document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'No release year data available.';
        return;
     }
    document.getElementById('release-year-chart').style.display = 'block';
    document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'Track count by year of release';

     const yearCounts = {};
     let minYear = Infinity, maxYear = -Infinity, validYearCount = 0;
     tracks.forEach(track => {
         if (track && typeof track.releaseYear === 'number' && track.releaseYear >= 1900 && track.releaseYear <= new Date().getFullYear() + 1) {
             yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1;
             minYear = Math.min(minYear, track.releaseYear);
             maxYear = Math.max(maxYear, track.releaseYear);
             validYearCount++;
         }
     });

     if (validYearCount === 0) {
         if (chartInstances.year) chartInstances.year.destroy();
         document.getElementById('release-year-chart').style.display = 'none';
         document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'No valid release year data found.';
         return;
     }

     const labels = Array.from({length: maxYear - minYear + 1}, (_, i) => (minYear + i).toString());
     const data = labels.map(year => yearCounts[year] || 0);

     const chartData = { labels, datasets: [{
        label: 'Tracks Released', data, borderColor: 'rgba(79, 70, 229, 0.8)',
        backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5
     }]};
     const chartOptions = {
         responsive: true, maintainAspectRatio: false,
         scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#eee' } } },
         plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }
     };
     createOrUpdateChart('release-year-chart', 'line', chartData, chartOptions, 'year');
}

const debouncedUpdateCharts = debounce((genreData) => {
    const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';
    const pieCanvas = document.getElementById('genre-pie-chart');
    const barCanvas = document.getElementById('genre-bar-chart');

    if (chartInstances.pie) chartInstances.pie.destroy();
    if (chartInstances.bar) chartInstances.bar.destroy();

    if (!genreData || genreData.length === 0) {
        pieChartTitle.textContent = `Genre Distribution (${sourceName} - No Data)`;
        barChartTitle.textContent = `Top Genres (${sourceName} - No Data)`;
        if (pieCanvas) pieCanvas.style.display = 'none';
        if (barCanvas) barCanvas.style.display = 'none';
        populateGenreRadioButtons([]);
        return;
    }

    if (pieCanvas) pieCanvas.style.display = 'block';
    if (barCanvas) barCanvas.style.display = 'block';

    const topN = 15;
    const topGenres = genreData.slice(0, topN);
    const labels = topGenres.map(g => g.genre);
    const counts = topGenres.map(g => g.count);
    const backgroundColors = generateConsistentColors(labels);

    const pieData = { labels, datasets: [{ data: counts, backgroundColor: backgroundColors, borderColor: '#ffffff', borderWidth: 1 }] };
    const pieOptions = { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} (${((c.raw / c.chart.getDatasetMeta(0).total) * 100).toFixed(1)}%)` } }
        },
        onClick: (e, elements) => handleChartClick(e, elements, labels)
    };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;

    const barData = { labels, datasets: [{ label: 'Track Count', data: counts, backgroundColor: backgroundColors, borderWidth: 0 }] };
    const barOptions = { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} tracks` } } },
        scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } },
        onClick: (e, elements) => handleChartClick(e, elements, labels)
    };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;
    populateGenreRadioButtons(genreData.slice(0, 12));
}, 250);

function displayTopArtists(tracks, artistDetails) {
    const artistChartCanvas = document.getElementById('top-artists-chart');
    const artistListDiv = topArtistsListContainer;

    if (chartInstances.artists) chartInstances.artists.destroy();
    artistListDiv.innerHTML = '<p class="small-text">Calculating...</p>';
    topArtistCountEl.textContent = '0';
    if (artistChartCanvas) artistChartCanvas.style.display = 'none';

    if (!tracks || tracks.length === 0 || !artistDetails) {
        artistListDiv.innerHTML = '<p class="small-text">No artist data available.</p>';
        return [];
    }

    const artistCounts = {};
    tracks.forEach(track => {
        if (track && track.primaryArtistName) artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1;
    });

    const sortedArtists = Object.entries(artistCounts).map(([name, count]) => ({ name, count, details: Object.values(artistDetails).find(d => d && d.name === name) })).sort((a, b) => b.count - a.count);
    const topArtistsForDisplay = sortedArtists.slice(0, 10);
    topArtistCountEl.textContent = topArtistsForDisplay.length;

    if (topArtistsForDisplay.length === 0) {
        artistListDiv.innerHTML = '<p class="small-text">No top artists found.</p>';
        return sortedArtists;
    }

    if (artistChartCanvas) artistChartCanvas.style.display = 'block';
    const chartLabels = topArtistsForDisplay.map(a => a.name);
    const chartData = topArtistsForDisplay.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels);
    const doughnutData = { labels: chartLabels, datasets: [{ label: 'Track Appearances', data: chartData, backgroundColor: chartColors, borderColor: '#ffffff', borderWidth: 2 }] };
    const doughnutOptions = { responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} track${c.raw !== 1 ? 's' : ''}` } } }
    };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');

    artistListDiv.innerHTML = '';
    const fragment = document.createDocumentFragment();
    topArtistsForDisplay.forEach(artist => {
        const card = document.createElement('div');
        card.className = 'artist-card animate-on-scroll';
        const imageUrl = artist.details?.imageUrl;
        const spotifyUrl = artist.details?.spotifyUrl;
        card.innerHTML = `
            <img src="${imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${imageUrl ? '' : 'artist-placeholder'}" onerror="this.onerror=null;this.src='placeholder.png';">
            <div class="artist-info">
                <h4>${spotifyUrl ? `<a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" title="View ${artist.name} on Spotify">${artist.name}</a>` : artist.name}</h4>
                <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
            </div>`;
        fragment.appendChild(card);
    });
    artistListDiv.appendChild(fragment);
    return sortedArtists;
}


// --- Track List Rendering ---
function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    trackGenresListDiv.innerHTML = '';
    filterNoticeContainer.innerHTML = '';

    if (filterGenre) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'filter-notice';
        noticeDiv.innerHTML = `
            <span><span data-feather="filter" class="icon"></span> Filtered by genre: <strong>${filterGenre}</strong></span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear Filter</button>`;
        filterNoticeContainer.appendChild(noticeDiv);
    }

    const tracksToDisplay = filterGenre ? tracks.filter(track => new Set([...(track.spotifyGenres || []), ...(track.lastFmTags || [])]).has(filterGenre)) : tracks;

    if (!tracksToDisplay || tracksToDisplay.length === 0) {
        trackGenresListDiv.innerHTML = `<p class="small-text centered-section">No tracks found${filterGenre ? ` matching the genre "${filterGenre}"` : ''}.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    tracksToDisplay.forEach(track => {
        try {
            const trackCard = document.createElement('div');
            trackCard.className = 'track-card animate-on-scroll';

            const genresToShow = new Set();
            if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') {
                track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' }));
            }
            if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') {
                track.lastFmTags?.forEach(g => genresToShow.add({ genre: g, source: 'lastfm' }));
            }

            const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));
            const genresHtml = sortedGenres.length > 0
                ? sortedGenres.map(item => `<span class="track-genre genre-${item.source}" data-genre="${item.genre.replace(/"/g, '"')}" title="Filter by ${item.genre}">${item.genre}</span>`).join('')
                : '<span class="no-genres">No tags available</span>';

            trackCard.innerHTML = `
                <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album || 'Album'}" loading="lazy" onerror="this.onerror=null;this.src='placeholder.png';">
                <div class="track-info">
                    <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">
                        ${track.title} ${track.explicit ? '<span class="explicit-tag" title="Explicit">E</span>' : ''}
                    </div>
                    <div class="track-artist">${track.artist}</div>
                    <div class="track-album">${track.album} (${track.releaseYear || '?'})</div>
                    ${track.spotifyUrl ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify">
                        <span data-feather="play-circle" class="icon button-icon"></span>Listen
                    </a>` : ''}
                    <div class="track-genres">${genresHtml}</div>
                </div>`;
            fragment.appendChild(trackCard);
        } catch(e) {
            console.error("Failed to render a track card.", { trackData: track, error: e });
        }
    });

    trackGenresListDiv.appendChild(fragment);
    replaceFeatherIcons();
    // **FIX**: Re-run the observer to make the newly rendered track cards visible.
    setupIntersectionObserver();
}
function filterTracksByGenre(genre) {
    currentGenreFilter = genre;
    if (currentPlaylistData && currentPlaylistData.tracks) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
        const trackListSection = document.getElementById('track-genres-container');
        if (trackListSection) {
            trackListSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// --- Source Toggling Logic ---
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) return;
     activeGenreSource = newSource;
     genreSourceButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.source === newSource));
     if (currentPlaylistData.tracks) {
         const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
         debouncedUpdateCharts(genreCounts);
     }
}
function updateActiveTrackGenreSource(newSource) {
    if (activeTrackGenreSource === newSource) return;
    activeTrackGenreSource = newSource;
    if (currentPlaylistData && currentPlaylistData.tracks) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    }
}

// --- Last.fm Feature Implementations ---
function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = '';
    genreRadioResultsPanel.classList.add('hidden');
    genreRadioListDiv.innerHTML = '';
    if (!topGenres || topGenres.length === 0) {
        genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    topGenres.forEach(({ genre }) => {
        const button = document.createElement('button');
        button.className = 'action-button genre-radio-btn animate-on-scroll';
        button.textContent = genre;
        button.dataset.genre = genre;
        button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre));
        fragment.appendChild(button);
    });
    genreRadioButtonsContainer.appendChild(fragment);
}
async function fetchAndDisplayTopTracksForGenre(genre) {
    showLoading(true, `Fetching top tracks for '${genre}'...`);
    genreRadioListDiv.innerHTML = '<p class="small-text">Loading...</p>';
    selectedGenreRadioSpan.textContent = genre;
    genreRadioResultsPanel.classList.remove('hidden');

    const data = await fetchLastFmAPI({ method: 'tag.gettoptracks', tag: genre, limit: 12 });
    showLoading(false);

    if (data?.tracks?.track && data.tracks.track.length > 0) {
        genreRadioListDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item animate-on-scroll';
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            const listeners = parseInt(track.listeners, 10) || 0;
            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${listeners > 0 ? `<span><span data-feather="headphones" class="icon xs"></span> ${listeners.toLocaleString()} listeners</span>` : ''}`;
            fragment.appendChild(itemDiv);
        });
        genreRadioListDiv.appendChild(fragment);
    } else {
        genreRadioListDiv.innerHTML = `<p class="small-text">Could not find popular tracks for "${genre}".</p>`;
    }
     replaceFeatherIcons();
     setupIntersectionObserver();
     genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


async function fetchAndDisplayAggregateRecommendations(topPlaylistArtists, allPlaylistArtistNamesLower) {
    const artistsForQuery = topPlaylistArtists.slice(0, 10);
    if (artistsForQuery.length === 0) {
        similarArtistsContainer.classList.add('hidden');
        return;
    }

    similarArtistsContainer.classList.remove('hidden');
    const titleElement = similarArtistsContainer.querySelector('h3');
    const descElement = similarArtistsContainer.querySelector('p');
    if (titleElement) titleElement.innerHTML = `<span data-feather="thumbs-up" class="icon"></span> Recommended Artists`;
    if (descElement) descElement.textContent = `Artists similar to your top ${artistsForQuery.length} playlist artists, ranked by recommendation frequency.`;
    replaceFeatherIcons();

    if (similarArtistsButtonsPlaceholder) {
        similarArtistsButtonsPlaceholder.classList.remove('hidden');
        similarArtistsButtonsPlaceholder.innerHTML = `<p class="small-text">Analyzing recommendations...</p>`;
    }

    similarArtistsResultsPanel.classList.remove('hidden');
    similarArtistsListDiv.innerHTML = '<div class="loader small"></div><p class="small-text">Fetching...</p>';

    const recommendations = {};
    for (const sourceArtist of artistsForQuery) {
        if (!sourceArtist || !sourceArtist.name) continue;
        const data = await fetchLastFmAPI({ method: 'artist.getsimilar', artist: sourceArtist.name, autocorrect: 1, limit: 15 });
        if (data?.similarartists?.artist && data.similarartists.artist.length > 0) {
            data.similarartists.artist.forEach(similar => {
                if (!similar || !similar.name) return;
                const nameLower = similar.name.toLowerCase().trim();
                if (!nameLower || allPlaylistArtistNamesLower.has(nameLower)) return;
                if (!recommendations[nameLower]) recommendations[nameLower] = { name: similar.name, count: 0, matchSum: 0 };
                recommendations[nameLower].count++;
                recommendations[nameLower].matchSum += parseFloat(similar.match || 0);
            });
        }
    }

    if (similarArtistsButtonsPlaceholder) similarArtistsButtonsPlaceholder.classList.add('hidden');

    const rankedRecommendations = Object.values(recommendations)
        .sort((a, b) => (b.count - a.count) || ((b.matchSum / b.count) - (a.matchSum / a.count)))
        .slice(0, 15);

    similarArtistsListDiv.innerHTML = '';
    if (rankedRecommendations.length > 0) {
        const fragment = document.createDocumentFragment();
        rankedRecommendations.forEach(rec => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item recommendation-card animate-on-scroll';
            const spotifySearchUrl = `https://open.spotify.com/search/artist%3A${encodeURIComponent(rec.name)}`;
            const avgMatch = rec.count > 0 ? Math.round((rec.matchSum / rec.count) * 100) : 0;
            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer">${rec.name}</a>
                 <span><span data-feather="check-circle" class="icon xs"></span> Recommended ${rec.count} time${rec.count !== 1 ? 's' : ''}</span>
                 ${avgMatch > 0 ? `<span><span data-feather="percent" class="icon xs"></span> Avg Match: ${avgMatch}%</span>` : ''}`;
            fragment.appendChild(itemDiv);
        });
        similarArtistsListDiv.appendChild(fragment);
    } else {
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find any new recommended artists.</p>`;
    }

    replaceFeatherIcons();
    setupIntersectionObserver();
    similarArtistsResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// --- Main Analysis Flow ---
async function analyzePlaylist() {
    const playlistInputVal = playlistInput.value.trim();
    if (!playlistInputVal) {
        showError("Please enter a Spotify Playlist URL or ID.");
        return;
    }
    const playlistId = extractPlaylistId(playlistInputVal);
    if (!playlistId) return;

    showSkeletonLoader(true);
    clearError();
    currentPlaylistData = null;
    currentGenreFilter = null;
    Object.values(chartInstances).forEach(chart => chart?.destroy());
    chartInstances = {};
    genreRadioResultsPanel.classList.add('hidden');
    similarArtistsResultsPanel.classList.add('hidden');
    similarArtistsContainer.classList.add('hidden');

    try {
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details. Check URL/ID or login status.");
        if (playlistInfo.tracks?.total === 0) throw new Error("This playlist is empty.");

        const tracksRaw = await getPlaylistTracks(playlistId);
        if (!tracksRaw || tracksRaw.length === 0) throw new Error("Could not retrieve playlist tracks.");

        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
        if (artistIds.length === 0) throw new Error("No valid artists found.");

        const artistDetails = await getArtistDetailsAndGenres(artistIds);
        if (!artistDetails) throw new Error("Failed to fetch artist details.");

        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);

        displayPlaylistInfo(currentPlaylistData);
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        debouncedUpdateCharts(initialGenreCounts);
        createReleaseYearChart(currentPlaylistData.tracks);
        const allSortedArtists = displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails);
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource);

        showSkeletonLoader(false);

        if (allSortedArtists?.length > 0 && currentPlaylistData?.tracks) {
             const allPlaylistArtistNamesLower = new Set(currentPlaylistData.tracks.map(t => t.primaryArtistName.toLowerCase().trim()));
             fetchAndDisplayAggregateRecommendations(allSortedArtists, allPlaylistArtistNamesLower);
        } else {
             similarArtistsContainer.classList.add('hidden');
        }

        setTimeout(() => resultsContainer.querySelector('.section-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

    } catch (error) {
        console.error("Analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}`);
        showSkeletonLoader(false);
        resultsContainer.classList.add('hidden');
    }
}


// --- Event Listeners ---
function setupEventListeners() {
    loginButton.addEventListener('click', redirectToSpotifyLogin);
    analyzeButton.addEventListener('click', analyzePlaylist);

    genreSourceButtons.forEach(button => {
        button.addEventListener('click', () => updateActiveGenreSource(button.dataset.source));
    });

    trackGenreSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => { if (radio.checked) updateActiveTrackGenreSource(radio.value); });
    });

    playlistInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            analyzeButton.click();
        }
    });

    playlistInput.addEventListener('input', clearError);

    // **FIX**: Use event delegation for dynamically created elements.
    // This is more efficient and avoids memory leaks.
    trackGenresListDiv.addEventListener('click', (event) => {
        const genreTag = event.target.closest('.track-genre');
        if (genreTag && genreTag.dataset.genre) {
            filterTracksByGenre(genreTag.dataset.genre);
        }
    });

    filterNoticeContainer.addEventListener('click', (event) => {
        if (event.target.id === 'clear-filter-btn') {
            filterTracksByGenre(null);
        }
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    updateFooterYear();
    replaceFeatherIcons();
    handleAuthentication();
    setupEventListeners();

    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    const initialTrackGenreRadio = document.getElementById(`genre-toggle-${activeTrackGenreSource}`);
    if (initialTrackGenreRadio) initialTrackGenreRadio.checked = true;
});

// --- Utility - Color Generation ---
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
    return Math.abs(hash | 0);
}
function generateConsistentColors(labels) {
    return labels.map(label => `hsl(${simpleHash(label) % 360}, 70%, 55%)`);
}