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
const loadingOverlay = document.getElementById('loading-overlay'); // Kept for potential future use
const loadingMessage = document.getElementById('loading-message'); // Kept for potential future use
const resultsSkeletonLoader = document.getElementById('results-skeleton-loader');
const resultsActualContent = document.getElementById('results-actual-content');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
const genreSourceButtons = document.querySelectorAll('.toggle-button[data-source]');
const trackGenreSourceRadios = document.querySelectorAll('input[name="trackGenreSource"]');

// Specific Feature Elements
const similarArtistsContainer = document.getElementById('similar-artists-container'); // Container for the whole section
// REMOVE: const similarArtistsButtonsContainer = document.getElementById('similar-artists-buttons'); // No longer needed
// REMOVE: const selectedArtistSpan = document.getElementById('selected-artist-similar'); // No longer needed
const similarArtistsResultsPanel = document.getElementById('similar-artists-results'); // Keep the panel for results
const similarArtistsListDiv = document.getElementById('similar-artists-list'); // Keep the list div

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
    }
}

function setupIntersectionObserver() {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
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
        setTimeout(() => { replaceFeatherIcons(); setupIntersectionObserver(); }, 50);
    }
}

function updateFooterYear() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

function showLoading(show, message = "Processing...") {
    // This is now mainly for intermediate API steps, not the main load
    const overlay = document.getElementById('loading-overlay'); // Re-get reference if needed, or ensure it exists
    const msgElement = document.getElementById('loading-message'); // Re-get reference if needed
    if (overlay && msgElement) { // Check if elements exist
         if (show) {
             msgElement.textContent = message;
             overlay.classList.remove('hidden');
             console.log("Loading:", message);
         } else {
             overlay.classList.add('hidden');
         }
    } else if (show) {
        // Fallback or alternative feedback if overlay isn't present/used
        console.log("Loading (no overlay):", message);
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

// --- Spotify Authentication --- (No changes from previous version)
function handleAuthentication() {
    const tokenFromStorage = sessionStorage.getItem('spotify_access_token');
    const expiryTime = sessionStorage.getItem('spotify_token_expiry');
    const tokenFromUrl = getAccessTokenFromUrl();

    if (tokenFromUrl) {
        spotifyAccessToken = tokenFromUrl.token;
        const expires_in = tokenFromUrl.expires_in;
        sessionStorage.setItem('spotify_access_token', spotifyAccessToken);
        sessionStorage.setItem('spotify_token_expiry', Date.now() + expires_in * 1000);
        console.log("Spotify Access Token obtained and stored.");
        history.pushState("", document.title, window.location.pathname + window.location.search);
    } else if (tokenFromStorage && expiryTime && Date.now() < expiryTime) {
        spotifyAccessToken = tokenFromStorage;
        console.log("Using stored Spotify Access Token.");
    } else {
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_token_expiry');
        spotifyAccessToken = null;
        console.log("No valid Spotify token found.");
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
    return null;
}
function logout() {
    spotifyAccessToken = null;
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    updateLoginState();
    console.log("User logged out.");
}

// --- API Fetching --- (No changes from previous version)
async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) { console.error('Spotify Token missing!'); showError("Auth required."); logout(); return null; }
    const url = `https://api.spotify.com/v1/${endpoint}`;
    try {
        const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${spotifyAccessToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : null });
        if (response.status === 401) { console.error('Spotify 401'); showError("Session expired."); logout(); return null; }
        if (response.status === 429) {
             console.warn('Spotify 429'); showError("Rate limit hit.", true);
             await new Promise(resolve => setTimeout(resolve, response.headers.get('Retry-After') * 1000 || 5000));
             return fetchSpotifyAPI(endpoint, method, body);
        }
        const responseData = await response.json();
        if (!response.ok) { console.error(`Spotify Error ${response.status}:`, responseData); showError(`Spotify Error: ${responseData.error?.message || response.statusText}`); return null; }
        return responseData;
    } catch (error) { console.error('Network error fetching Spotify:', error); showError("Network error (Spotify)."); return null; }
}
async function lastFmRateLimiter() {
    const now = Date.now();
    const timeSinceLastCall = now - lastFmApiCallTimestamp;
    if (timeSinceLastCall < LASTFM_API_DELAY) { await new Promise(resolve => setTimeout(resolve, LASTFM_API_DELAY - timeSinceLastCall)); }
    lastFmApiCallTimestamp = Date.now();
}
async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY; params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;
    await lastFmRateLimiter();
    try {
        const response = await fetch(url); const data = await response.json();
        if (!response.ok || data.error) {
            const errorCode = data.error || response.status; const errorMsg = data.message || response.statusText || 'Unknown Last.fm error';
            console.error(`Last.fm API Error ${errorCode}: ${errorMsg}`, params);
            // Optionally show error if !errorCode 6 (NotFound)
            return null;
        }
        return data;
    } catch (error) { console.error('Network error fetching Last.fm:', error); showError("Network error (Last.fm)."); return null; }
}

// --- Data Processing --- (No changes from previous version)
function extractPlaylistId(input) {
    try {
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input); const pathParts = url.pathname.split('/');
            const idIndex = pathParts.indexOf('playlist');
            if (idIndex !== -1 && pathParts.length > idIndex + 1) { return pathParts[idIndex + 1].split('?')[0]; }
        } else if (input.startsWith('spotify:playlist:')) { return input.split(':')[2]; }
        else if (/^[a-zA-Z0-9]{22}$/.test(input)) { return input; }
    } catch (e) { console.error("Error parsing playlist input:", e); }
    return null;
}
async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next&limit=50`;
    let trackCount = 0; const maxTracks = 1000;
    showLoading(true, "Fetching tracks...");
    while (url && trackCount < maxTracks) {
        const data = await fetchSpotifyAPI(url);
        if (!data || !data.items) { showError("Failed track fetch."); return tracks.length > 0 ? tracks : null; }
        const validItems = data.items.filter(item => item?.track?.id);
        tracks = tracks.concat(validItems); trackCount = tracks.length;
        showLoading(true, `Fetched ${trackCount} tracks...`);
        url = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
        if(url) await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (trackCount >= maxTracks) { console.warn(`Reached ${maxTracks} track limit.`); showError(`Analyzed first ${maxTracks} tracks.`, true); }
    console.log(`Fetched ${trackCount} valid tracks.`);
    return tracks;
}
async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)]; const artistDetails = {};
    const batchSize = 50; const totalArtists = uniqueArtistIds.length;
    showLoading(true, `Fetching Spotify details (${totalArtists} artists)...`);
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const data = await fetchSpotifyAPI(`artists?ids=${batchIds.join(',')}`);
        if (data?.artists) {
            data.artists.forEach(artist => { if (artist) { artistDetails[artist.id] = { name: artist.name, spotifyGenres: artist.genres || [], imageUrl: artist.images?.length ? artist.images[1]?.url || artist.images[0]?.url : null, lastFmTags: [], spotifyUrl: artist.external_urls?.spotify }; } });
        }
        showLoading(true, `Fetched Spotify ${Math.min(i + batchSize, totalArtists)}/${totalArtists}...`);
        if (i + batchSize < totalArtists) await new Promise(resolve => setTimeout(resolve, 50));
    }
    showLoading(true, `Fetching Last.fm tags (${totalArtists} artists)...`);
    let lastfmFetchedCount = 0;
    for (const artistId of uniqueArtistIds) {
         if (!artistDetails[artistId]) { lastfmFetchedCount++; continue; }
        const artistName = artistDetails[artistId].name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params);
        if (lastfmData?.toptags?.tag) {
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             artistDetails[artistId].lastFmTags = tags.slice(0, 10).map(tag => tag.name.toLowerCase().trim()).filter(Boolean);
        }
        lastfmFetchedCount++;
         if (lastfmFetchedCount % 20 === 0 || lastfmFetchedCount === totalArtists) { showLoading(true, `Fetched Last.fm ${lastfmFetchedCount}/${totalArtists}...`); }
    }
    console.log("Finished artist details fetch.");
    return artistDetails;
}
function processPlaylistData(playlistInfo, tracks, artistDetails) {
    const processedTracks = tracks.map(item => {
        const track = item.track; if (!track || !track.artists?.length) return null;
        let trackSpotifyGenres = new Set(); let trackLastFmTags = new Set();
        track.artists.forEach(a => { const details = artistDetails[a.id]; if (details) { details.spotifyGenres.forEach(g => trackSpotifyGenres.add(g.toLowerCase().trim())); details.lastFmTags.forEach(t => trackLastFmTags.add(t.toLowerCase().trim())); } });
        const primaryArtistDetails = artistDetails[track.artists[0].id];
        return { id: track.id, title: track.name, artist: track.artists.map(a => a.name).join(', '), primaryArtistName: primaryArtistDetails?.name || track.artists[0].name, album: track.album.name, imageUrl: track.album.images?.length ? track.album.images[1]?.url || track.album.images[0]?.url : null, spotifyUrl: track.external_urls?.spotify, releaseYear: track.album.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null, durationMs: track.duration_ms, explicit: track.explicit, spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(), lastFmTags: [...trackLastFmTags].filter(Boolean).sort() };
    }).filter(Boolean);
    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');
    const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName));
    return { id: playlistInfo.id, name: playlistInfo.name, description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''), imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null, owner: playlistInfo.owner.display_name, spotifyUrl: playlistInfo.external_urls.spotify, tracks: processedTracks, stats: { totalTracks: processedTracks.length, totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`, uniqueArtists: uniqueArtistNames.size }, artistDetails: artistDetails };
}

// --- UI Display --- (displayPlaylistInfo, getGenreCounts - no changes)
function displayPlaylistInfo(playlistData) {
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.imageUrl || 'placeholder.png'}" alt="${playlistData.name} cover art" loading="lazy">
        <div class="playlist-details">
            <h3>${playlistData.name}</h3>
            <p>By ${playlistData.owner}</p>
            ${playlistData.description ? `<p class="description">${playlistData.description}</p>` : ''}
            <p><a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">
                <span data-feather="external-link" class="icon button-icon"></span>View on Spotify
            </a></p>
        </div>
    `;
    totalTracksEl.textContent = playlistData.stats.totalTracks;
    totalDurationEl.textContent = playlistData.stats.totalDurationFormatted;
    uniqueArtistsEl.textContent = playlistData.stats.uniqueArtists;
    replaceFeatherIcons(); // Replace icon in button
}
function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {}; const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';
    tracks.forEach(track => { track[key]?.forEach(genre => { if (genre) { genreCounts[genre] = (genreCounts[genre] || 0) + 1; } }); });
    const sortedGenres = Object.entries(genreCounts).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count);
    uniqueGenresEl.textContent = sortedGenres.length;
    return sortedGenres;
}

// --- Chart Rendering --- (createOrUpdateChart, handleChartClick, createReleaseYearChart - no changes)
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) { console.error(`Canvas ID '${chartId}' not found.`); return; }
    if (chartInstances[instanceKey]) { chartInstances[instanceKey].destroy(); }
    try { chartInstances[instanceKey] = new Chart(ctx, { type: chartType, data, options }); }
    catch(e) { console.error(`Error creating chart '${instanceKey}':`, e); showError(`Could not render ${instanceKey} chart.`); }
}
function handleChartClick(event, elements, labels) {
     if (elements.length > 0) { try { const genre = labels[elements[0].index]; if (genre) { filterTracksByGenre(genre); } } catch (e) { console.error("Chart click error:", e); } }
}
function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) return; const yearCounts = {}; let minYear = Infinity, maxYear = -Infinity;
     tracks.forEach(track => { if (track.releaseYear && track.releaseYear > 1900 && track.releaseYear <= new Date().getFullYear() + 1) { yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1; minYear = Math.min(minYear, track.releaseYear); maxYear = Math.max(maxYear, track.releaseYear); } });
     if (Object.keys(yearCounts).length === 0) { console.log("No valid release year data."); return; }
     const labels = []; const data = []; for (let year = minYear; year <= maxYear; year++) { labels.push(year.toString()); data.push(yearCounts[year] || 0); }
     const chartData = { labels, datasets: [{ label: 'Tracks Released', data, borderColor: 'rgba(79, 70, 229, 0.8)', backgroundColor: 'rgba(79, 70, 229, 0.1)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5 }] };
     const chartOptions = { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: false }, grid: { display: false } }, y: { beginAtZero: true, title: { display: false }, grid: { color: '#eee' } } }, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } } };
     createOrUpdateChart('release-year-chart', 'line', chartData, chartOptions, 'year');
}

/**
 * Debounced function to update the genre pie and bar charts.
 * Also populates genre radio buttons.
 */
const debouncedUpdateCharts = debounce((genreData) => {
    const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';
    if (!genreData || genreData.length === 0) {
        if (chartInstances.pie) chartInstances.pie.destroy(); if (chartInstances.bar) chartInstances.bar.destroy();
        pieChartTitle.textContent = `Genre Distribution (${sourceName} - No Data)`; barChartTitle.textContent = `Top Genres (${sourceName} - No Data)`;
        populateGenreRadioButtons([]); return;
    }
    const topN = 15; const topGenres = genreData.slice(0, topN); const labels = topGenres.map(g => g.genre);
    const counts = topGenres.map(g => g.count); const backgroundColors = generateConsistentColors(labels);
    const pieData = { labels, datasets: [{ data: counts, backgroundColor: backgroundColors, borderColor: '#ffffff', borderWidth: 1 }] };
    const pieOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels:{ boxWidth: 12, padding: 8, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}` } } }, onClick: (e, el) => handleChartClick(e, el, labels) };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;
    const barData = { labels, datasets: [{ label: 'Track Count', data: counts, backgroundColor: backgroundColors, borderWidth: 0 }] };
    const barOptions = { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} tracks` } } }, scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }, onClick: (e, el) => handleChartClick(e, el, labels) };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;
    populateGenreRadioButtons(genreData.slice(0, 12));
}, 250);

/**
 * Displays the top artists chart and list.
 * @param {Array} tracks
 * @param {object} artistDetails
 * @returns {Array} List of top artist objects { name, count, details }.
 */
function displayTopArtists(tracks, artistDetails) {
    if (!tracks || tracks.length === 0 || !artistDetails) { topArtistsListContainer.innerHTML = '<p class="small-text">No artist data available.</p>'; return []; }
    const artistCounts = {};
    tracks.forEach(track => { if (track.primaryArtistName) { artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1; } });
    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({ name, count, details: Object.values(artistDetails).find(d => d.name === name) }))
        .sort((a, b) => b.count - a.count);

    const topN = 10; // Define how many artists are "top"
    const topArtists = sortedArtists.slice(0, topN);
    if (topArtistCountEl) topArtistCountEl.textContent = topArtists.length;

    // Chart
    const chartLabels = topArtists.map(a => a.name);
    const chartData = topArtists.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels);
    const doughnutData = { labels: chartLabels, datasets: [{ label: 'Appearances', data: chartData, backgroundColor: chartColors, borderColor: '#ffffff', borderWidth: 2 }] };
    const doughnutOptions = { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} tracks` } } } };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');

    // List
    topArtistsListContainer.innerHTML = '';
    if (topArtists.length === 0) { topArtistsListContainer.innerHTML = '<p class="small-text">No top artists found.</p>'; return []; }
    topArtists.forEach(artist => {
        const card = document.createElement('div'); card.className = 'artist-card';
        const imageUrl = artist.details?.imageUrl; const spotifyUrl = artist.details?.spotifyUrl;
        card.innerHTML = `
            <img src="${imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${imageUrl ? '' : 'artist-placeholder'}">
            <div class="artist-info">
                <h4>${spotifyUrl ? `<a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" title="View ${artist.name} on Spotify">${artist.name}</a>` : artist.name}</h4>
                <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
            </div>
        `;
        topArtistsListContainer.appendChild(card);
    });

    // !! Return the calculated top artists for the next step !!
    return topArtists;
}


// --- Track List Rendering --- (displayTrackList, filterTracksByGenre - no changes)
function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    trackGenresListDiv.innerHTML = ''; filterNoticeContainer.innerHTML = '';
    if (filterGenre) {
        const noticeDiv = document.createElement('div'); noticeDiv.className = 'filter-notice';
        noticeDiv.innerHTML = `<span><span data-feather="filter" class="icon"></span> Filtered by: <strong>${filterGenre}</strong></span> <button id="clear-filter-btn" class="clear-filter-button">Clear</button>`;
        filterNoticeContainer.appendChild(noticeDiv);
        document.getElementById('clear-filter-btn').addEventListener('click', () => filterTracksByGenre(null));
        replaceFeatherIcons();
    }
    const filteredTracks = filterGenre ? tracks.filter(track => new Set([...(track.spotifyGenres || []), ...(track.lastFmTags || [])]).has(filterGenre)) : tracks;
    if (filteredTracks.length === 0) { trackGenresListDiv.innerHTML = `<p class="small-text centered-section">No tracks found${filterGenre ? ` matching "${filterGenre}"` : ''}.</p>`; return; }
    const fragment = document.createDocumentFragment();
    filteredTracks.forEach(track => {
        const trackCard = document.createElement('div'); trackCard.className = 'track-card animate-on-scroll';
        const genresToShow = new Set();
        if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') { track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' })); }
        if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') { track.lastFmTags?.forEach(g => genresToShow.add({ genre: g, source: 'lastfm' })); }
        const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));
        const genresHtml = sortedGenres.map(item => `<span class="track-genre genre-${item.source}" data-genre="${item.genre}" title="Filter by ${item.genre}">${item.genre}</span>`).join('');
        trackCard.innerHTML = `
            <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album}" loading="lazy">
            <div class="track-info">
                <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">${track.title}${track.explicit ? ' <span class="explicit-tag" title="Explicit">E</span>' : ''}</div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-album">${track.album} (${track.releaseYear || '?'})</div>
                ${track.spotifyUrl ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify"><span data-feather="play-circle" class="icon button-icon"></span>Listen</a>` : ''}
                <div class="track-genres">${genresHtml || '<span class="no-genres">No tags available</span>'}</div>
            </div>`;
        trackCard.querySelectorAll('.track-genre').forEach(tag => { tag.addEventListener('click', (e) => { e.stopPropagation(); filterTracksByGenre(tag.dataset.genre); }); });
        fragment.appendChild(trackCard);
    });
    trackGenresListDiv.appendChild(fragment);
    replaceFeatherIcons(); setupIntersectionObserver();
}
function filterTracksByGenre(genre) {
    currentGenreFilter = genre;
    if (currentPlaylistData) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
        document.getElementById('track-genres-container')?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
}

// --- Source Toggling Logic --- (updateActiveGenreSource, updateActiveTrackGenreSource - no changes)
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) return;
     activeGenreSource = newSource;
     genreSourceButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.source === newSource));
     const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
     debouncedUpdateCharts(genreCounts);
     console.log(`Genre source switched to: ${newSource}`);
}
function updateActiveTrackGenreSource(newSource) {
    if (!currentPlaylistData || activeTrackGenreSource === newSource) return;
    activeTrackGenreSource = newSource;
    displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    console.log(`Track genre display switched to: ${newSource}`);
}

// --- Last.fm Feature Implementations --- (populateGenreRadioButtons, fetchAndDisplayTopTracksForGenre - no changes)
function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = ''; genreRadioResultsPanel.classList.add('hidden'); genreRadioListDiv.innerHTML = '';
    if (!topGenres || topGenres.length === 0) { genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified.</p>'; return; }
    topGenres.forEach(({ genre }) => { const button = document.createElement('button'); button.className = 'action-button genre-radio-btn'; button.textContent = genre; button.dataset.genre = genre; button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre)); genreRadioButtonsContainer.appendChild(button); });
}
async function fetchAndDisplayTopTracksForGenre(genre) {
    showLoading(true, `Fetching top tracks for '${genre}'...`);
    genreRadioListDiv.innerHTML = '<p class="small-text">Loading tracks...</p>'; selectedGenreRadioSpan.textContent = genre;
    genreRadioResultsPanel.classList.remove('hidden');
    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 }; const data = await fetchLastFmAPI(params); showLoading(false);
    if (data?.tracks?.track?.length > 0) {
        genreRadioListDiv.innerHTML = '';
        data.tracks.track.forEach(track => { const itemDiv = document.createElement('div'); itemDiv.className = 'lastfm-result-item animate-on-scroll'; const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            itemDiv.innerHTML = `<a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search Spotify">${track.name}</a> <span>by ${track.artist.name}</span> ${track.listeners ? `<span><span data-feather="headphones" class="icon xs"></span> ${parseInt(track.listeners).toLocaleString()} listeners</span>` : ''}`;
            genreRadioListDiv.appendChild(itemDiv);
        });
    } else { genreRadioListDiv.innerHTML = `<p class="small-text">No popular tracks found for "${genre}" on Last.fm.</p>`; }
     replaceFeatherIcons(); setupIntersectionObserver(); genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- NEW: Aggregate Similar Artist Recommendation ---

/**
 * Fetches similar artists for multiple source artists, aggregates recommendations,
 * filters out existing playlist artists, ranks them, and displays the results.
 * @param {Array} topPlaylistArtists - Array of { name, count, details } for top artists in the playlist.
 * @param {Set<string>} allPlaylistArtistNames - Set of all unique primary artist names in the playlist (lowercase).
 */
async function fetchAndDisplayAggregateRecommendations(topPlaylistArtists, allPlaylistArtistNames) {
    if (!topPlaylistArtists || topPlaylistArtists.length === 0) {
        similarArtistsContainer.classList.add('hidden'); // Hide section if no top artists
        return;
    }

    similarArtistsContainer.classList.remove('hidden'); // Ensure section is visible
    // Update Title/Description for Aggregate View
    const titleElement = similarArtistsContainer.querySelector('h3');
    const descElement = similarArtistsContainer.querySelector('p');
    if (titleElement) titleElement.innerHTML = `<span data-feather="thumbs-up" class="icon"></span> Top Recommended Artists`;
    if (descElement) descElement.textContent = `Artists similar to your playlist's top artists, ranked by recommendation frequency.`;

    // REMOVE the single-artist buttons and selection span logic
    // similarArtistsButtonsContainer.innerHTML = '<p class="small-text">Loading recommendations...</p>'; // Clear old buttons
    const buttonsPlaceholder = similarArtistsContainer.querySelector('#similar-artists-buttons');
    if (buttonsPlaceholder) buttonsPlaceholder.innerHTML = '<p class="small-text">Analyzing recommendations based on your top artists...</p>'; // Update placeholder

    similarArtistsResultsPanel.classList.remove('hidden'); // Show panel for loading/results
    similarArtistsListDiv.innerHTML = '<p class="small-text">Fetching similar artists from Last.fm...</p>'; // Loading state

    const recommendations = {}; // { artistNameLower: { name: properName, count: N, matchSum: M } }
    let fetchedCount = 0;
    const totalToFetch = topPlaylistArtists.length;

    for (const sourceArtist of topPlaylistArtists) {
        showLoading(true, `Finding similar artists (${fetchedCount + 1}/${totalToFetch})...`);
        const params = { method: 'artist.getsimilar', artist: sourceArtist.name, autocorrect: 1, limit: 10 }; // Get top 10 similar
        const data = await fetchLastFmAPI(params);
        fetchedCount++;

        if (data?.similarartists?.artist?.length > 0) {
            data.similarartists.artist.forEach(similar => {
                const nameLower = similar.name.toLowerCase().trim();
                if (!nameLower || allPlaylistArtistNames.has(nameLower)) {
                    return; // Skip empty names or artists already in the playlist
                }

                if (!recommendations[nameLower]) {
                    recommendations[nameLower] = { name: similar.name, count: 0, matchSum: 0 };
                }
                recommendations[nameLower].count++;
                recommendations[nameLower].matchSum += parseFloat(similar.match || 0);
            });
        }
        // Update placeholder text if needed
        if (buttonsPlaceholder) buttonsPlaceholder.innerHTML = `<p class="small-text">Analyzing recommendations... (${fetchedCount}/${totalToFetch})</p>`;
    }
     if (buttonsPlaceholder) buttonsPlaceholder.classList.add('hidden'); // Hide placeholder once done fetching
     showLoading(false); // Hide intermediate loading overlay

    // --- Process and Display Recommendations ---
    const rankedRecommendations = Object.values(recommendations)
        .sort((a, b) => {
            // Sort primarily by count descending, secondarily by average match descending
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            const avgMatchA = a.count > 0 ? a.matchSum / a.count : 0;
            const avgMatchB = b.count > 0 ? b.matchSum / b.count : 0;
            return avgMatchB - avgMatchA;
        })
        .slice(0, 15); // Show top 15 recommendations

    similarArtistsListDiv.innerHTML = ''; // Clear loading state

    if (rankedRecommendations.length > 0) {
        rankedRecommendations.forEach(rec => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item recommendation-card animate-on-scroll'; // Add specific class if needed
            const spotifySearchUrl = `https://open.spotify.com/search/artist%3A${encodeURIComponent(rec.name)}`;
            const avgMatch = rec.count > 0 ? Math.round((rec.matchSum / rec.count) * 100) : 0;

            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${rec.name}' on Spotify">${rec.name}</a>
                 <span><span data-feather="check-circle" class="icon xs"></span> Recommended ${rec.count} time${rec.count !== 1 ? 's' : ''}</span>
                 ${avgMatch > 0 ? `<span><span data-feather="percent" class="icon xs"></span> Avg Match: ${avgMatch}%</span>` : ''}
            `;
            similarArtistsListDiv.appendChild(itemDiv);
        });
    } else {
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find any new similar artists based on your top playlist artists.</p>`;
    }
    replaceFeatherIcons();
    setupIntersectionObserver();
    similarArtistsResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// --- Main Analysis Flow ---

/**
 * Orchestrates the entire playlist analysis process.
 */
async function analyzePlaylist() {
    const playlistInputVal = playlistInput.value.trim();
    if (!playlistInputVal) { showError("Please enter a Spotify Playlist URL or ID."); return; }
    const playlistId = extractPlaylistId(playlistInputVal);
    if (!playlistId) { showError("Invalid Spotify Playlist URL or ID format."); return; }

    showSkeletonLoader(true); clearError();
    currentPlaylistData = null; currentGenreFilter = null;
    genreRadioResultsPanel.classList.add('hidden'); similarArtistsResultsPanel.classList.add('hidden'); // Reset panels

    try {
        showLoading(true, "Fetching playlist details..."); // Use simple overlay for API steps
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details.");
        if (playlistInfo.tracks?.total === 0) throw new Error("This playlist appears to be empty.");

        const tracksRaw = await getPlaylistTracks(playlistId);
        if (!tracksRaw || tracksRaw.length === 0) throw new Error("Playlist tracks empty or fetch failed.");

        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
        if (artistIds.length === 0) throw new Error("No valid artists found.");

        const artistDetails = await getArtistDetailsAndGenres(artistIds);
        if (!artistDetails) throw new Error("Failed to fetch artist details.");

        showLoading(true, "Processing data...");
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);
        showLoading(false); // Hide simple overlay

        // --- Render Initial Content (while skeleton is still shown) ---
        displayPlaylistInfo(currentPlaylistData);
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        debouncedUpdateCharts(initialGenreCounts); // Renders charts & populates genre radio
        createReleaseYearChart(currentPlaylistData.tracks);
        const topArtists = displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails); // Renders chart/list & RETURNS top artists
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource);

        // --- Swap Skeleton for Content ---
        showSkeletonLoader(false); // Hide skeleton, reveal actual content

        // --- Run Aggregate Recommendations AFTER main content is displayed ---
        if (topArtists && topArtists.length > 0 && currentPlaylistData?.tracks) {
             const allArtistNamesLower = new Set(currentPlaylistData.tracks.map(t => t.primaryArtistName.toLowerCase().trim()));
             // Run async without blocking main thread further, provide loading feedback within the function
             fetchAndDisplayAggregateRecommendations(topArtists, allArtistNamesLower);
        } else {
             // Hide the similar artists section if no top artists were found
             similarArtistsContainer.classList.add('hidden');
             console.log("Skipping aggregate recommendations (no top artists).");
        }

        console.log("Analysis complete.");
         setTimeout(() => { resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);

    } catch (error) {
        console.error("Analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}. Please check the playlist URL/ID and try again.`);
        showSkeletonLoader(false); // Hide skeleton on error
        resultsContainer.classList.add('hidden'); // Hide results container
        showLoading(false); // Ensure simple overlay is hidden
    }
}


// --- Event Listeners --- (No changes needed here)
function setupEventListeners() {
    loginButton.addEventListener('click', redirectToSpotifyLogin);
    analyzeButton.addEventListener('click', analyzePlaylist);
    genreSourceButtons.forEach(button => button.addEventListener('click', () => updateActiveGenreSource(button.dataset.source)));
    trackGenreSourceRadios.forEach(radio => radio.addEventListener('change', () => { if (radio.checked) { updateActiveTrackGenreSource(radio.value); } }));
    playlistInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') { event.preventDefault(); analyzeButton.click(); } });
    playlistInput.addEventListener('input', clearError);
}

// --- Initialization --- (No changes needed here)
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Playlist Visualizer.");
    updateFooterYear(); replaceFeatherIcons(); handleAuthentication(); setupEventListeners();
    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    document.getElementById(`genre-toggle-${activeTrackGenreSource}`)?.setAttribute('checked', true);
});

// --- Utility - Color Generation --- (No changes needed here)
function simpleHash(str) { let hash = 5381; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) + hash) + str.charCodeAt(i); hash |= 0; } return Math.abs(hash); }
function generateConsistentColors(labels) { const colors = []; const saturation = 70; const lightness = 55; labels.forEach((label) => { const hue = simpleHash(label) % 360; colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`); }); return colors; }