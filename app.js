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
const similarArtistsContainer = document.getElementById('similar-artists-container'); // Container for the whole section
const similarArtistsButtonsPlaceholder = document.getElementById('similar-artists-buttons'); // Placeholder for loading text
const similarArtistsResultsPanel = document.getElementById('similar-artists-results'); // Panel for results
const similarArtistsListDiv = document.getElementById('similar-artists-list'); // The list div

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
        // Defer icon replacement and observer setup slightly to ensure elements are rendered
        setTimeout(() => {
            replaceFeatherIcons();
            setupIntersectionObserver();
        }, 100); // Increased delay slightly
    }
}

function updateFooterYear() {
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

// Simplified showLoading for intermediate steps (e.g., API calls within analysis)
function showLoading(show, message = "Processing...") {
    // This function can update a dedicated small loading indicator if needed,
    // but for now, just logs to console during background API calls.
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
        console.log("Spotify Access Token obtained and stored.");
        // Clear the hash from the URL
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
    // Ensure initial overlay hides AFTER checking token
    if(initialLoadingOverlay) initialLoadingOverlay.classList.add('hidden');
}
function updateLoginState() {
     if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        instructionsSection.classList.remove('hidden'); // Show instructions after login check
        setTimeout(setupIntersectionObserver, 50); // Setup animations for newly shown elements
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
        instructionsSection.classList.remove('hidden'); // Show instructions if not logged in too
        resultsContainer.classList.add('hidden'); // Ensure results are hidden
    }
     replaceFeatherIcons(); // Make sure icons render correctly on state change
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
        sessionStorage.removeItem('spotify_auth_state'); // Clean up state
        return { token, expires_in: parseInt(expires_in, 10) };
    }
    // Clear hash if it doesn't contain a valid token response
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
    console.log("User logged out.");
    // Optionally redirect to home or clear results
    resultsContainer.classList.add('hidden');
    playlistInput.value = ''; // Clear input field
}

// --- API Fetching ---
async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        console.error('Spotify Access Token is missing or expired.');
        showError("Authentication required. Please log in again.");
        logout(); // Force logout if token is missing during API call
        return null;
    }
    const url = `https://api.spotify.com/v1/${endpoint}`;
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : null
        });
        if (response.status === 401) {
            console.error('Spotify API returned 401 (Unauthorized). Token likely expired.');
            showError("Your session has expired. Please log in again.");
            logout(); // Force logout on 401
            return null;
        }
        if (response.status === 429) {
             console.warn('Spotify API rate limit hit (429). Retrying after delay...');
             const retryAfterSeconds = parseInt(response.headers.get('Retry-After') || '5', 10);
             showError(`Rate limit hit. Retrying in ${retryAfterSeconds}s...`, true);
             await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
             return fetchSpotifyAPI(endpoint, method, body); // Retry the request
        }
        // Try parsing JSON even for errors, as Spotify often includes error details
        const responseData = await response.json().catch(() => null); // Avoid crash if body is not JSON

        if (!response.ok) {
            const errorMessage = responseData?.error?.message || response.statusText || `HTTP Error ${response.status}`;
            console.error(`Spotify API Error ${response.status}: ${errorMessage}`, responseData);
            showError(`Spotify Error: ${errorMessage}`);
            return null; // Return null for non-successful responses
        }
        return responseData;
    } catch (error) {
        console.error('Network error fetching Spotify API:', error);
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
    lastFmApiCallTimestamp = Date.now(); // Update timestamp *after* potential delay
}
async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    await lastFmRateLimiter(); // Ensure rate limiting before fetch

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            if (data.error !== 6) { // Error 6 ("Artist not found", etc.) is common and not critical
                 console.error(`Last.fm API Error ${data.error}: ${data.message}`, params);
                 showError(`Last.fm Error (${params.method}): ${data.message}`, true);
            } else {
                 console.log(`Last.fm Info (${params.method}): ${data.message}`);
            }
            return null;
        }
        if (!response.ok) {
             console.error(`Last.fm HTTP Error ${response.status}: ${response.statusText}`, params);
             showError(`Last.fm Error: ${response.statusText || 'Unknown error'}`, true);
             return null;
        }
        return data;
    } catch (error) {
        console.error('Network error fetching Last.fm API:', error);
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
        console.error("Error parsing playlist input:", e);
        showError("Could not parse the provided playlist input. Please use a valid URL or ID.");
    }
    return null;
}
async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,popularity,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next&limit=50`;
    let trackCount = 0;
    const maxTracks = 1000;

    showLoading(true, "Fetching playlist tracks...");
    let page = 1;

    while (url && trackCount < maxTracks) {
        showLoading(true, `Fetching track page ${page}...`);
        const data = await fetchSpotifyAPI(url);
        if (!data) {
             showError("Failed to fetch tracks (authentication issue or API error). Analysis stopped.");
             return null;
        }
        if (!data.items || data.items.length === 0) {
            break;
        }

        const validItems = data.items.filter(item => item && item.track && item.track.id);
        tracks = tracks.concat(validItems);
        trackCount = tracks.length;

        console.log(`Fetched ${trackCount} tracks so far...`);

        url = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
        page++;

        if (url) await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (trackCount >= maxTracks) {
        console.warn(`Reached track limit of ${maxTracks}. Analyzing the first ${maxTracks} tracks.`);
        showError(`Playlist contains more than ${maxTracks} tracks. Analysis limited to the first ${maxTracks}.`, true);
    }

    console.log(`Finished fetching. Total valid tracks: ${trackCount}`);
    showLoading(false);
    return tracks;
}
async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)];
    const artistDetails = {};
    const batchSize = 50;
    const totalArtists = uniqueArtistIds.length;

    console.log(`Fetching details for ${totalArtists} unique artists...`);

    showLoading(true, `Fetching Spotify details (batch 1)...`);
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const endpoint = `artists?ids=${batchIds.join(',')}`;
        showLoading(true, `Fetching Spotify batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalArtists / batchSize)}...`);
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
        } else if (!data && !spotifyAccessToken) {
             return null;
        }
        if (i + batchSize < totalArtists) await new Promise(resolve => setTimeout(resolve, 50));
    }
     console.log("Fetched Spotify artist details.");

    showLoading(true, `Fetching Last.fm tags (0/${totalArtists})...`);
    let lastfmFetchedCount = 0;
    for (const artistId of uniqueArtistIds) {
        if (!artistDetails[artistId] || !artistDetails[artistId].name) {
            lastfmFetchedCount++;
            continue;
        }
        const artistName = artistDetails[artistId].name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params);

        if (lastfmData?.toptags?.tag) {
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             artistDetails[artistId].lastFmTags = tags
                .slice(0, 10)
                .map(tag => tag.name.toLowerCase().trim())
                .filter(Boolean);
        }
        lastfmFetchedCount++;
        if (lastfmFetchedCount % 10 === 0 || lastfmFetchedCount === totalArtists) {
            showLoading(true, `Fetching Last.fm tags (${lastfmFetchedCount}/${totalArtists})...`);
        }
    }
    console.log("Finished fetching Last.fm tags.");
    showLoading(false);
    return artistDetails;
}
function processPlaylistData(playlistInfo, tracks, artistDetails) {
    if (!tracks || tracks.length === 0) {
        console.warn("No tracks provided to processPlaylistData");
        return {};
    }
    const processedTracks = tracks.map(item => {
        const track = item.track;
        if (!track || !track.id || !track.artists || track.artists.length === 0 || !track.album) {
            console.warn("Skipping invalid track item:", item);
            return null;
        }

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
            if (track.album.release_date_precision === 'year') {
                releaseYear = parseInt(releaseDate, 10);
            } else {
                releaseYear = parseInt(releaseDate.substring(0, 4), 10);
            }
            if (isNaN(releaseYear) || releaseYear < 1900 || releaseYear > new Date().getFullYear() + 2) {
                releaseYear = null;
            }
        }

        const imageUrl = track.album.images?.find(img => img.width >= 50 && img.width <= 300)?.url
                       || track.album.images?.[1]?.url
                       || track.album.images?.[0]?.url
                       || null;

        return {
            id: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            primaryArtistName: primaryArtistDetails?.name || track.artists[0].name,
            album: track.album.name,
            imageUrl: imageUrl,
            spotifyUrl: track.external_urls?.spotify,
            releaseYear: releaseYear,
            durationMs: track.duration_ms,
            explicit: track.explicit,
            popularity: track.popularity,
            spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(),
            lastFmTags: [...trackLastFmTags].filter(Boolean).sort()
        };
    }).filter(Boolean);

    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');
    const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName));

    return {
        id: playlistInfo.id,
        name: playlistInfo.name,
        description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''),
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null,
        owner: playlistInfo.owner?.display_name || 'Unknown Owner',
        spotifyUrl: playlistInfo.external_urls?.spotify,
        tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`,
            uniqueArtists: uniqueArtistNames.size,
        },
        artistDetails: artistDetails
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
            <p>
                <a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">
                    <span data-feather="external-link" class="icon button-icon"></span>View on Spotify
                </a>
            </p>` : ''}
        </div>
    `;
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
                if (genre) {
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
                }
            });
        }
    });

    const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);

    uniqueGenresEl.textContent = sortedGenres.length;
    return sortedGenres;
}

// --- Chart Rendering ---
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas context for ID '${chartId}' not found.`);
        return;
    }

    if (chartInstances[instanceKey]) {
        try {
            chartInstances[instanceKey].destroy();
        } catch (e) {
            console.error(`Error destroying chart '${instanceKey}':`, e);
        }
        chartInstances[instanceKey] = null;
    }

    try {
        chartInstances[instanceKey] = new Chart(ctx, { type: chartType, data, options });
    } catch (e) {
        console.error(`Error creating chart '${instanceKey}':`, e);
        showError(`Could not render the ${instanceKey} chart.`);
    }
}
function handleChartClick(event, elements, labels) {
     if (elements && elements.length > 0) {
        try {
            const index = elements[0].index;
            const genre = labels[index];
            if (genre) {
                console.log(`Chart clicked: Filtering by genre '${genre}'`);
                filterTracksByGenre(genre);
            }
        } catch (e) {
            console.error("Error handling chart click:", e);
        }
    }
}
function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) {
         if (chartInstances.year) { chartInstances.year.destroy(); chartInstances.year = null; }
         document.getElementById('release-year-chart').style.display = 'none';
         document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'No release year data available.';
        return;
     }
    document.getElementById('release-year-chart').style.display = 'block';
    document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'Track count by year of release';

     const yearCounts = {};
     let minYear = Infinity, maxYear = -Infinity;
     let validYearCount = 0;

     tracks.forEach(track => {
         if (track && typeof track.releaseYear === 'number' && track.releaseYear >= 1900 && track.releaseYear <= new Date().getFullYear() + 1) {
             yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1;
             minYear = Math.min(minYear, track.releaseYear);
             maxYear = Math.max(maxYear, track.releaseYear);
             validYearCount++;
         }
     });

     if (validYearCount === 0) {
         if (chartInstances.year) { chartInstances.year.destroy(); chartInstances.year = null; }
         document.getElementById('release-year-chart').style.display = 'none';
         document.getElementById('release-year-container').querySelector('.chart-tip').textContent = 'No valid release year data found.';
         return;
     }

     const labels = [];
     const data = [];
     for (let year = minYear; year <= maxYear; year++) {
         labels.push(year.toString());
         data.push(yearCounts[year] || 0);
     }

     const chartData = {
         labels,
         datasets: [{
             label: 'Tracks Released',
             data,
             borderColor: 'rgba(79, 70, 229, 0.8)',
             backgroundColor: 'rgba(79, 70, 229, 0.1)',
             fill: true,
             tension: 0.3,
             pointRadius: 2,
             pointHoverRadius: 5
         }]
     };
     const chartOptions = {
         responsive: true,
         maintainAspectRatio: false,
         scales: {
             x: { title: { display: false }, grid: { display: false } },
             y: { beginAtZero: true, title: { display: false }, grid: { color: '#eee' } }
         },
         plugins: {
             legend: { display: false },
             tooltip: { mode: 'index', intersect: false }
         }
     };
     createOrUpdateChart('release-year-chart', 'line', chartData, chartOptions, 'year');
}

const debouncedUpdateCharts = debounce((genreData) => {
    const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';
    const pieCanvas = document.getElementById('genre-pie-chart');
    const barCanvas = document.getElementById('genre-bar-chart');

    if (chartInstances.pie) { chartInstances.pie.destroy(); chartInstances.pie = null; }
    if (chartInstances.bar) { chartInstances.bar.destroy(); chartInstances.bar = null; }

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

    const pieData = {
        labels,
        datasets: [{
            data: counts,
            backgroundColor: backgroundColors,
            borderColor: '#ffffff',
            borderWidth: 1
        }]
    };
    const pieOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const total = context.chart.getDatasetMeta(0).total;
                        const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) + '%' : '0%';
                        return `${context.label}: ${context.raw} (${percentage})`;
                    }
                }
            }
        },
        onClick: (e, elements) => handleChartClick(e, elements, labels)
    };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;

    const barData = {
        labels,
        datasets: [{
            label: 'Track Count', data: counts, backgroundColor: backgroundColors, borderWidth: 0
        }]
    };
    const barOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (context) => `${context.raw} tracks` } }
        },
        scales: {
            x: { beginAtZero: true, grid: { display: false } },
            y: { grid: { display: false } }
        },
        onClick: (e, elements) => handleChartClick(e, elements, labels)
    };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;
    populateGenreRadioButtons(genreData.slice(0, 12));
}, 250);

function displayTopArtists(tracks, artistDetails) {
    const artistChartCanvas = document.getElementById('top-artists-chart');
    const artistListDiv = topArtistsListContainer;

    if (chartInstances.artists) { chartInstances.artists.destroy(); chartInstances.artists = null;}
    if (artistListDiv) artistListDiv.innerHTML = '<p class="small-text">Calculating top artists...</p>';
    if (topArtistCountEl) topArtistCountEl.textContent = '0';
    if (artistChartCanvas) artistChartCanvas.style.display = 'none';

    if (!tracks || tracks.length === 0 || !artistDetails) {
        if (artistListDiv) artistListDiv.innerHTML = '<p class="small-text">No artist data available to display.</p>';
        return [];
    }

    const artistCounts = {};
    tracks.forEach(track => {
        if (track && track.primaryArtistName) {
            artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1;
        }
    });

    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => {
            const details = Object.values(artistDetails).find(d => d && d.name === name);
            return { name, count, details };
        })
        .sort((a, b) => b.count - a.count);

    const topN = 10;
    const topArtistsForDisplay = sortedArtists.slice(0, topN);

    if (topArtistCountEl) topArtistCountEl.textContent = topArtistsForDisplay.length;

    if (topArtistsForDisplay.length === 0) {
        if (artistListDiv) artistListDiv.innerHTML = '<p class="small-text">No top artists found in this playlist.</p>';
        return sortedArtists;
    }

    if (artistChartCanvas) artistChartCanvas.style.display = 'block';
    const chartLabels = topArtistsForDisplay.map(a => a.name);
    const chartData = topArtistsForDisplay.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels);
    const doughnutData = {
        labels: chartLabels,
        datasets: [{
            label: 'Track Appearances', data: chartData, backgroundColor: chartColors, borderColor: '#ffffff', borderWidth: 2
        }]
    };
    const doughnutOptions = {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (context) => `${context.label}: ${context.raw} track${context.raw !== 1 ? 's' : ''}`
                }
            }
        }
    };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');

    if (artistListDiv) {
        artistListDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        topArtistsForDisplay.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'artist-card animate-on-scroll';
            const imageUrl = artist.details?.imageUrl;
            const spotifyUrl = artist.details?.spotifyUrl;
            const placeholderClass = imageUrl ? '' : 'artist-placeholder';

            card.innerHTML = `
                <img src="${imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${placeholderClass}" onerror="this.onerror=null;this.src='placeholder.png';">
                <div class="artist-info">
                    <h4>${spotifyUrl ? `<a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer" title="View ${artist.name} on Spotify">${artist.name}</a>` : artist.name}</h4>
                    <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
                </div>
            `;
            fragment.appendChild(card);
        });
        artistListDiv.appendChild(fragment);
    }
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
            <span>
                <span data-feather="filter" class="icon"></span> Filtered by genre: <strong>${filterGenre}</strong>
            </span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear Filter</button>
        `;
        filterNoticeContainer.appendChild(noticeDiv);
        document.getElementById('clear-filter-btn').addEventListener('click', () => {
            filterTracksByGenre(null);
        });
        replaceFeatherIcons();
    }

    const tracksToDisplay = filterGenre
        ? tracks.filter(track => {
            const allGenres = new Set([...(track.spotifyGenres || []), ...(track.lastFmTags || [])]);
            return allGenres.has(filterGenre);
          })
        : tracks;

    if (!tracksToDisplay || tracksToDisplay.length === 0) {
        trackGenresListDiv.innerHTML = `<p class="small-text centered-section">No tracks found${filterGenre ? ` matching the genre "${filterGenre}"` : ' in this playlist'}.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    tracksToDisplay.forEach(track => {
        try { // FIX: Add try-catch for robust rendering of individual tracks
            const trackCard = document.createElement('div');
            trackCard.className = 'track-card animate-on-scroll';

            // FIX: Corrected logic for displaying genres
            const genresToShow = new Set();
            if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') {
                track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' }));
            }
            if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') {
                track.lastFmTags?.forEach(g => genresToShow.add({ genre: g, source: 'lastfm' }));
            }

            const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));
            const genresHtml = sortedGenres.length > 0
                ? sortedGenres.map(item =>
                    `<span class="track-genre genre-${item.source}" data-genre="${item.genre}" title="Filter by ${item.genre}">${item.genre}</span>`
                  ).join('')
                : '<span class="no-genres">No tags available</span>';

            trackCard.innerHTML = `
                <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album || 'Album'}" loading="lazy" onerror="this.onerror=null;this.src='placeholder.png';">
                <div class="track-info">
                    <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">
                        ${track.title}
                        ${track.explicit ? ' <span class="explicit-tag" title="Explicit">E</span>' : ''}
                    </div>
                    <div class="track-artist">${track.artist}</div>
                    <div class="track-album">${track.album} (${track.releaseYear || 'Year ?'})</div>
                    ${track.spotifyUrl ? `
                        <a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify">
                            <span data-feather="play-circle" class="icon button-icon"></span>Listen
                        </a>` : ''}
                    <div class="track-genres">${genresHtml}</div>
                </div>`;

            trackCard.querySelectorAll('.track-genre').forEach(tag => {
                tag.addEventListener('click', (e) => {
                    e.stopPropagation();
                    filterTracksByGenre(tag.dataset.genre);
                });
            });
            fragment.appendChild(trackCard);
        } catch(e) {
            console.error("Failed to render a track card. Skipping.", { trackData: track, error: e });
        }
    });

    trackGenresListDiv.appendChild(fragment);
    replaceFeatherIcons();
}
function filterTracksByGenre(genre) {
    currentGenreFilter = genre;
    console.log(`Filtering track list by genre: ${genre || 'None'}`);

    if (currentPlaylistData && currentPlaylistData.tracks) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
        const trackListSection = document.getElementById('track-genres-container');
        if (trackListSection) {
            trackListSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } else {
        console.warn("Cannot filter tracks: Playlist data is not available.");
    }
}

// --- Source Toggling Logic ---
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) {
         return;
     }
     activeGenreSource = newSource;
     console.log(`Switching main genre source to: ${newSource}`);

     genreSourceButtons.forEach(btn => {
         btn.classList.toggle('active', btn.dataset.source === newSource);
     });

     if (currentPlaylistData.tracks) {
         const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
         uniqueGenresEl.textContent = genreCounts.length;
         debouncedUpdateCharts(genreCounts);
     } else {
         uniqueGenresEl.textContent = '0';
         debouncedUpdateCharts([]);
     }
}
function updateActiveTrackGenreSource(newSource) {
    if (activeTrackGenreSource === newSource) {
        return;
    }
    activeTrackGenreSource = newSource;
    console.log(`Switching track genre display source to: ${newSource}`);

    if (currentPlaylistData && currentPlaylistData.tracks) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    } else {
        trackGenresListDiv.innerHTML = '<p class="small-text centered-section">Load a playlist to see tracks.</p>';
    }
}

// --- Last.fm Feature Implementations ---
function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = '';
    genreRadioResultsPanel.classList.add('hidden');
    genreRadioListDiv.innerHTML = '';

    if (!topGenres || topGenres.length === 0) {
        genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified for radio.</p>';
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
    console.log(`Fetching top Last.fm tracks for genre: ${genre}`);
    showLoading(true, `Fetching top tracks for '${genre}'...`);
    genreRadioListDiv.innerHTML = '<p class="small-text">Loading popular tracks...</p>';
    selectedGenreRadioSpan.textContent = genre;
    genreRadioResultsPanel.classList.remove('hidden');

    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 };
    const data = await fetchLastFmAPI(params);
    showLoading(false);

    if (data?.tracks?.track && data.tracks.track.length > 0) {
        genreRadioListDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item animate-on-scroll';
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            const listeners = track.listeners ? parseInt(track.listeners, 10) : 0;

            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${track.name}' by ${track.artist.name} on Spotify">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${listeners > 0 ? `<span><span data-feather="headphones" class="icon xs"></span> ${listeners.toLocaleString()} listeners</span>` : ''}
            `;
            fragment.appendChild(itemDiv);
        });
        genreRadioListDiv.appendChild(fragment);
    } else {
        genreRadioListDiv.innerHTML = `<p class="small-text">Could not find popular tracks for "${genre}" on Last.fm.</p>`;
    }
     replaceFeatherIcons();
     setupIntersectionObserver();
     genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


async function fetchAndDisplayAggregateRecommendations(topPlaylistArtists, allPlaylistArtistNamesLower) {
    const numArtistsToQuery = Math.min(topPlaylistArtists.length, 10);
    const artistsForQuery = topPlaylistArtists.slice(0, numArtistsToQuery);

    if (artistsForQuery.length === 0) {
        similarArtistsContainer.classList.add('hidden');
        return;
    }

    console.log(`Starting aggregate recommendations based on top ${artistsForQuery.length} artists.`);
    similarArtistsContainer.classList.remove('hidden');

    const titleElement = similarArtistsContainer.querySelector('h3');
    const descElement = similarArtistsContainer.querySelector('p');
    if (titleElement) titleElement.innerHTML = `<span data-feather="thumbs-up" class="icon"></span> Recommended Artists`;
    if (descElement) descElement.textContent = `Artists similar to your top ${artistsForQuery.length} playlist artists, ranked by recommendation frequency (excluding artists already in the playlist).`;
    replaceFeatherIcons();

    if (similarArtistsButtonsPlaceholder) {
        similarArtistsButtonsPlaceholder.classList.remove('hidden');
        similarArtistsButtonsPlaceholder.innerHTML = `<p class="small-text">Analyzing recommendations based on your top ${artistsForQuery.length} artists...</p>`;
    }

    similarArtistsResultsPanel.classList.remove('hidden');
    similarArtistsListDiv.innerHTML = '<div class="loader small"></div><p class="small-text">Fetching similar artists from Last.fm...</p>';

    const recommendations = {};
    let fetchedCount = 0;
    const totalToFetch = artistsForQuery.length;

    showLoading(true, `Fetching similar artists (0/${totalToFetch})...`);

    for (const sourceArtist of artistsForQuery) {
        if (!sourceArtist || !sourceArtist.name) continue;

        const params = { method: 'artist.getsimilar', artist: sourceArtist.name, autocorrect: 1, limit: 15 };
        const data = await fetchLastFmAPI(params);
        fetchedCount++;
        showLoading(true, `Fetching similar artists (${fetchedCount}/${totalToFetch})...`);

        if (similarArtistsButtonsPlaceholder) {
            similarArtistsButtonsPlaceholder.innerHTML = `<p class="small-text">Analyzing recommendations... (${fetchedCount}/${totalToFetch} artists checked)</p>`;
        }

        if (data?.similarartists?.artist && data.similarartists.artist.length > 0) {
            data.similarartists.artist.forEach(similar => {
                if (!similar || !similar.name) return;
                const nameLower = similar.name.toLowerCase().trim();
                if (!nameLower || allPlaylistArtistNamesLower.has(nameLower)) {
                    return;
                }
                if (!recommendations[nameLower]) {
                    recommendations[nameLower] = { name: similar.name, count: 0, matchSum: 0 };
                }
                recommendations[nameLower].count++;
                recommendations[nameLower].matchSum += parseFloat(similar.match || 0);
            });
        }
    }
    showLoading(false);

    if (similarArtistsButtonsPlaceholder) {
         similarArtistsButtonsPlaceholder.classList.add('hidden');
    }

    const rankedRecommendations = Object.values(recommendations)
        .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            const avgMatchA = a.count > 0 ? a.matchSum / a.count : 0;
            const avgMatchB = b.count > 0 ? b.matchSum / b.count : 0;
            return avgMatchB - avgMatchA;
        })
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
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${rec.name}' on Spotify">${rec.name}</a>
                 <span><span data-feather="check-circle" class="icon xs"></span> Recommended ${rec.count} time${rec.count !== 1 ? 's' : ''}</span>
                 ${avgMatch > 0 ? `<span><span data-feather="percent" class="icon xs"></span> Avg Match: ${avgMatch}%</span>` : ''}
            `;
            fragment.appendChild(itemDiv);
        });
        similarArtistsListDiv.appendChild(fragment);
    } else {
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find any new recommended artists based on your top playlist artists.</p>`;
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
    if (!playlistId) {
        return;
    }

    console.log(`Starting analysis for playlist ID: ${playlistId}`);
    showSkeletonLoader(true);
    clearError();
    currentPlaylistData = null;
    currentGenreFilter = null;
    Object.values(chartInstances).forEach(chart => chart?.destroy());
    chartInstances = {};
    genreRadioResultsPanel.classList.add('hidden');
    similarArtistsResultsPanel.classList.add('hidden');
    similarArtistsContainer.classList.add('hidden');
    similarArtistsListDiv.innerHTML = '';
    if (similarArtistsButtonsPlaceholder) similarArtistsButtonsPlaceholder.classList.add('hidden');


    try {
        showLoading(true, "Fetching playlist details...");
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details. Check URL/ID or login status.");
        if (playlistInfo.tracks?.total === 0) throw new Error("This playlist appears to be empty. Cannot analyze.");

        const tracksRaw = await getPlaylistTracks(playlistId);
        if (!tracksRaw) throw new Error("Failed to fetch playlist tracks. Analysis stopped.");
        if (tracksRaw.length === 0) throw new Error("Playlist tracks are empty or could not be retrieved.");

        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
        if (artistIds.length === 0) throw new Error("No valid artists found in the playlist tracks.");
        const artistDetails = await getArtistDetailsAndGenres(artistIds);
        if (!artistDetails) throw new Error("Failed to fetch artist details. Analysis stopped.");

        showLoading(true, "Processing data...");
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);
        showLoading(false);

        displayPlaylistInfo(currentPlaylistData);
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
        debouncedUpdateCharts(initialGenreCounts);
        createReleaseYearChart(currentPlaylistData.tracks);
        const allSortedArtists = displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails);
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource);

        showSkeletonLoader(false);

        if (allSortedArtists && allSortedArtists.length > 0 && currentPlaylistData?.tracks) {
             const allPlaylistArtistNamesLower = new Set(
                 currentPlaylistData.tracks.map(t => t.primaryArtistName.toLowerCase().trim())
             );
             fetchAndDisplayAggregateRecommendations(allSortedArtists, allPlaylistArtistNamesLower);
        } else {
             similarArtistsContainer.classList.add('hidden');
             console.log("Skipping aggregate recommendations (no top artists found or track data missing).");
        }

        console.log("Playlist analysis complete.");
        setTimeout(() => {
             const resultsH2 = resultsContainer.querySelector('.section-title');
             if (resultsH2) {
                 resultsH2.scrollIntoView({ behavior: 'smooth', block: 'start' });
             }
        }, 200);

    } catch (error) {
        console.error("Playlist analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}. Please check the playlist URL/ID and try again.`);
        showSkeletonLoader(false);
        resultsContainer.classList.add('hidden');
        showLoading(false);
    }
}


// --- Event Listeners ---
function setupEventListeners() {
    loginButton.addEventListener('click', redirectToSpotifyLogin);
    analyzeButton.addEventListener('click', analyzePlaylist);

    genreSourceButtons.forEach(button => {
        button.addEventListener('click', () => {
            updateActiveGenreSource(button.dataset.source);
        });
    });

    trackGenreSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                updateActiveTrackGenreSource(radio.value);
            }
        });
    });

    playlistInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            analyzeButton.click();
        }
    });

    playlistInput.addEventListener('input', clearError);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing Playlist Visualizer ✨.");
    updateFooterYear();
    replaceFeatherIcons();
    handleAuthentication();
    setupEventListeners();

    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    const initialTrackGenreRadio = document.getElementById(`genre-toggle-${activeTrackGenreSource}`);
    if (initialTrackGenreRadio) {
        initialTrackGenreRadio.checked = true;
    }
});

// --- Utility - Color Generation ---
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) + hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function generateConsistentColors(labels) {
    const colors = [];
    const saturation = 70;
    const lightness = 55;

    labels.forEach((label) => {
        const hue = simpleHash(label) % 360;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    });
    return colors;
}