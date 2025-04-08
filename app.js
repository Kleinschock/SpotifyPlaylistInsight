// --- Configuration ---
const CLIENT_ID = '732dc1eab09c4120945541da8f197de8'; // Your Spotify Client ID
const REDIRECT_URI = window.location.origin + window.location.pathname;
const LASTFM_API_KEY = '0d01968c9827680d5686e7bb324fc8e8'; // Your Last.fm API Key
const LASTFM_API_BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// --- State Variables ---
let spotifyAccessToken = null;
let currentPlaylistData = null;
let activeGenreSource = 'spotify'; // 'spotify' or 'lastfm'
let activeTrackGenreSource = 'spotify'; // 'spotify', 'lastfm', or 'both'
let currentGenreFilter = null;
let chartInstances = {}; // Store chart instances { pie, bar, year, artists }

// --- DOM Elements ---
const loginButton = document.getElementById('login-button');
const analyzeButton = document.getElementById('analyze-button');
const playlistInput = document.getElementById('playlist-input');
const loginContainer = document.getElementById('login-container');
const instructionsSection = document.getElementById('instructions');
const playlistContainer = document.getElementById('playlist-container');
const resultsContainer = document.getElementById('results-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresListDiv = document.getElementById('track-genres-list');
const apiErrorDiv = document.getElementById('api-error');
const genreSourceButtons = document.querySelectorAll('.toggle-button[data-source]');
const trackGenreSourceRadios = document.querySelectorAll('input[name="trackGenreSource"]');
const similarArtistsButtonsContainer = document.getElementById('similar-artists-buttons');
const similarArtistsResultsPanel = document.getElementById('similar-artists-results');
const similarArtistsListDiv = document.getElementById('similar-artists-list');
const selectedArtistSpan = document.getElementById('selected-artist-similar');
const genreRadioButtonsContainer = document.getElementById('genre-radio-buttons');
const genreRadioResultsPanel = document.getElementById('genre-radio-results');
const genreRadioListDiv = document.getElementById('genre-radio-list');
const selectedGenreRadioSpan = document.getElementById('selected-genre-radio');
const pieChartTitle = document.getElementById('genre-pie-chart-title');
const barChartTitle = document.getElementById('genre-bar-chart-title');
const filterNoticeContainer = document.getElementById('filter-notice-container');
// Stat elements
const totalTracksEl = document.getElementById('total-tracks');
const totalDurationEl = document.getElementById('total-duration');
const uniqueArtistsEl = document.getElementById('unique-artists');
const uniqueGenresEl = document.getElementById('unique-genres');
const topArtistsListContainer = document.getElementById('top-artists-list');


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
        // Clear hash from URL without reloading page
        history.pushState("", document.title, window.location.pathname + window.location.search);
    } else if (tokenFromStorage && expiryTime && Date.now() < expiryTime) {
        spotifyAccessToken = tokenFromStorage;
        console.log("Using stored Spotify Access Token.");
    } else {
        // No valid token found, clear potentially expired token
        sessionStorage.removeItem('spotify_access_token');
        sessionStorage.removeItem('spotify_token_expiry');
        spotifyAccessToken = null;
        console.log("No valid Spotify token found.");
    }

    updateLoginState();
}

function updateLoginState() {
     if (spotifyAccessToken) {
        loginContainer.classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        instructionsSection.classList.remove('hidden'); // Show instructions once logged in
    } else {
        loginContainer.classList.remove('hidden');
        playlistContainer.classList.add('hidden');
        instructionsSection.classList.remove('hidden'); // Show instructions for login prompt
        resultsContainer.classList.add('hidden'); // Hide results if logged out
    }
}

function redirectToSpotifyLogin() {
    const scope = 'playlist-read-private playlist-read-collaborative'; // Minimum scopes
    const state = generateRandomString(16); // Basic CSRF protection
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
    return null;
}

function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function logout() {
    spotifyAccessToken = null;
    sessionStorage.removeItem('spotify_access_token');
    sessionStorage.removeItem('spotify_token_expiry');
    updateLoginState();
    console.log("User logged out.");
}

// --- API Fetching ---

async function fetchSpotifyAPI(endpoint, method = 'GET', body = null) {
    if (!spotifyAccessToken) {
        console.error('Spotify Access Token missing!');
        showError("Spotify authentication required or token expired. Please re-login.");
        logout(); // Force logout state
        return null;
    }
    const url = `https://api.spotify.com/v1/${endpoint}`; // Added v1 prefix
    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`,
                'Content-Type': 'application/json' // Needed for POST/PUT
            },
            body: body ? JSON.stringify(body) : null
        });

        if (response.status === 401) { // Token expired or invalid
             console.error('Spotify API Error 401: Unauthorized.');
             showError("Spotify session expired. Please login again.");
             logout();
             return null;
        }
        if (response.status === 429) { // Rate limit
             console.warn('Spotify API Error 429: Rate limit hit. Waiting...');
             showError("Spotify rate limit hit. Please wait a moment and try again.");
             // Could implement exponential backoff here if needed
             await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
             return fetchSpotifyAPI(endpoint, method, body); // Retry once
        }

        const responseData = await response.json();

        if (!response.ok) {
            console.error(`Spotify API Error ${response.status}:`, responseData);
            showError(`Spotify API Error: ${responseData.error?.message || response.statusText}`);
            return null;
        }
        return responseData;
    } catch (error) {
        console.error('Network error fetching Spotify API:', error);
        showError("Network error connecting to Spotify. Please check your connection.");
        return null;
    }
}

async function fetchLastFmAPI(params) {
    params.api_key = LASTFM_API_KEY;
    params.format = 'json';
    const queryString = new URLSearchParams(params).toString();
    const url = `${LASTFM_API_BASE_URL}?${queryString}`;

    // Implement a small delay queue for Last.fm calls
    await lastFmRateLimiter();

    try {
        const response = await fetch(url);

        // Last.fm sometimes returns 200 OK even for errors, check content
        const data = await response.json();

        if (!response.ok || data.error) {
            const errorCode = data.error || response.status;
            const errorMsg = data.message || response.statusText || 'Unknown Last.fm error';
            console.error(`Last.fm API Error ${errorCode}: ${errorMsg}`, params);
            // Don't show generic errors like "artist not found" to the user unless critical
            if (errorCode !== 6) { // Error 6 is 'Parameter not found' / 'Artist not found' etc.
                 showError(`Last.fm API Error: ${errorMsg}`);
            }
            return null;
        }
        return data;
    } catch (error) {
        console.error('Network error fetching Last.fm API:', error);
        showError("Network error connecting to Last.fm. Please check your connection.");
        return null;
    }
}

// Simple Rate Limiter for Last.fm (e.g., 5 requests per second -> 200ms delay)
let lastFmApiCallTimestamp = 0;
const LASTFM_API_DELAY = 210; // Milliseconds between calls

async function lastFmRateLimiter() {
    const now = Date.now();
    const timeSinceLastCall = now - lastFmApiCallTimestamp;
    if (timeSinceLastCall < LASTFM_API_DELAY) {
        const delay = LASTFM_API_DELAY - timeSinceLastCall;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    lastFmApiCallTimestamp = Date.now();
}


// --- Data Processing ---

function extractPlaylistId(input) {
    try {
        // Check for full URL
        if (input.includes('open.spotify.com/playlist/')) {
            const url = new URL(input);
            const pathParts = url.pathname.split('/');
            const idIndex = pathParts.indexOf('playlist');
            if (idIndex !== -1 && pathParts.length > idIndex + 1) {
                return pathParts[idIndex + 1].split('?')[0]; // Get ID part before query params
            }
        }
        // Check for URI format
        else if (input.startsWith('spotify:playlist:')) {
             return input.split(':')[2];
        }
        // Basic check for ID format (22 alphanumeric chars)
        else if (/^[a-zA-Z0-9]{22}$/.test(input)) {
            return input;
        }
    } catch (e) {
        console.error("Error parsing playlist input:", e);
    }
    return null;
}

async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `playlists/${playlistId}/tracks?fields=items(track(id,name,duration_ms,explicit,external_urls(spotify),artists(id,name),album(id,name,release_date,release_date_precision,images))),next&limit=50`; // Request more fields
    let trackCount = 0;
    const maxTracks = 1000; // Safety limit

    showLoading(true, "Fetching playlist tracks...");

    while (url && trackCount < maxTracks) {
        const data = await fetchSpotifyAPI(url);
        if (!data || !data.items) {
             showError("Failed to fetch playlist tracks from Spotify.");
             return null; // Stop fetching if an error occurred
        }

        // Filter out null tracks or tracks without IDs (can happen)
        const validItems = data.items.filter(item => item && item.track && item.track.id);
        tracks = tracks.concat(validItems);
        trackCount = tracks.length;

        showLoading(true, `Fetched ${trackCount} tracks...`);

        url = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;

        // Optional slight delay between page fetches
        if(url) await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (trackCount >= maxTracks) {
        console.warn(`Reached track limit of ${maxTracks}. Playlist might be larger.`);
         showError(`Analyzed the first ${maxTracks} tracks. Playlist may be larger.`, true); // Non-fatal error
    }

    console.log(`Fetched a total of ${trackCount} valid tracks.`);
    return tracks;
}

async function getArtistDetailsAndGenres(artistIds) {
    const uniqueArtistIds = [...new Set(artistIds)]; // Ensure uniqueness
    const artistDetails = {};
    const batchSize = 50; // Max artists per Spotify API request
    const totalArtists = uniqueArtistIds.length;

    showLoading(true, `Fetching details for ${totalArtists} artists (Spotify)...`);

    // --- Fetch Spotify Genres ---
    for (let i = 0; i < totalArtists; i += batchSize) {
        const batchIds = uniqueArtistIds.slice(i, i + batchSize);
        const endpoint = `artists?ids=${batchIds.join(',')}`;
        const data = await fetchSpotifyAPI(endpoint);
        if (data && data.artists) {
            data.artists.forEach(artist => {
                if (artist) {
                    artistDetails[artist.id] = {
                        name: artist.name,
                        spotifyGenres: artist.genres || [],
                        imageUrl: artist.images?.length ? artist.images[1]?.url || artist.images[0]?.url : null, // Get medium or small image
                        lastFmTags: [], // Initialize
                        spotifyUrl: artist.external_urls?.spotify
                    };
                }
            });
        } else {
             console.warn(`Failed to fetch details for Spotify artist batch starting at index ${i}`);
        }
        showLoading(true, `Fetched Spotify details for ${Math.min(i + batchSize, totalArtists)}/${totalArtists} artists...`);
        if (i + batchSize < totalArtists) await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
    }

    // --- Fetch Last.fm Tags ---
    showLoading(true, `Fetching tags from Last.fm for ${totalArtists} artists...`);
    let lastfmFetchedCount = 0;
    for (const artistId of uniqueArtistIds) {
         // Check if artist was fetched successfully from Spotify
         if (!artistDetails[artistId]) {
             lastfmFetchedCount++; // Still increment count even if skipped
             continue;
         }

        const artistName = artistDetails[artistId].name;
        const params = { method: 'artist.gettoptags', artist: artistName, autocorrect: 1 };
        const lastfmData = await fetchLastFmAPI(params); // Uses built-in rate limiter

        if (lastfmData?.toptags?.tag) {
             const tags = Array.isArray(lastfmData.toptags.tag) ? lastfmData.toptags.tag : [lastfmData.toptags.tag];
             // Filter low-count tags if desired, e.g., tag.count > 5
             artistDetails[artistId].lastFmTags = tags.slice(0, 10).map(tag => tag.name.toLowerCase().trim()).filter(Boolean); // Limit, normalize, filter empty
        } else {
            // console.log(`No Last.fm tags found for artist: ${artistName}`);
        }
        lastfmFetchedCount++;
         if (lastfmFetchedCount % 20 === 0 || lastfmFetchedCount === totalArtists) { // Update progress less frequently
            showLoading(true, `Fetched Last.fm tags for ${lastfmFetchedCount}/${totalArtists} artists...`);
         }
    }

    console.log("Finished fetching artist details and tags.");
    return artistDetails;
}

function processPlaylistData(playlistInfo, tracks, artistDetails) {
    const processedTracks = tracks.map(item => {
        const track = item.track;
        if (!track || !track.artists?.length) return null; // Skip invalid tracks

        // Aggregate genres/tags from ALL artists on the track
        let trackSpotifyGenres = new Set();
        let trackLastFmTags = new Set();
        track.artists.forEach(a => {
            const details = artistDetails[a.id];
            if (details) {
                details.spotifyGenres.forEach(g => trackSpotifyGenres.add(g.toLowerCase().trim()));
                details.lastFmTags.forEach(t => trackLastFmTags.add(t.toLowerCase().trim())); // Already lowercased
            }
        });

         // Get primary artist details for display name/image
         const primaryArtistDetails = artistDetails[track.artists[0].id];

        return {
            id: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '), // Full artist list
            primaryArtistName: primaryArtistDetails?.name || track.artists[0].name, // For grouping/display
            album: track.album.name,
            imageUrl: track.album.images?.length ? track.album.images[1]?.url || track.album.images[0]?.url : null, // Track album art
            spotifyUrl: track.external_urls?.spotify,
            releaseYear: track.album.release_date ? parseInt(track.album.release_date.substring(0, 4)) : null,
            durationMs: track.duration_ms,
            explicit: track.explicit,
            spotifyGenres: [...trackSpotifyGenres].filter(Boolean).sort(), // Convert set to sorted array, remove empty
            lastFmTags: [...trackLastFmTags].filter(Boolean).sort()
        };
    }).filter(track => track !== null); // Remove any null tracks from processing errors

    // Calculate overall stats
    const totalDurationMs = processedTracks.reduce((sum, track) => sum + (track.durationMs || 0), 0);
    const totalMinutes = Math.floor(totalDurationMs / 60000);
    const totalSeconds = Math.floor((totalDurationMs % 60000) / 1000).toString().padStart(2, '0');
    const uniqueArtistNames = new Set(processedTracks.map(t => t.primaryArtistName));

    return {
        id: playlistInfo.id,
        name: playlistInfo.name,
        description: playlistInfo.description?.replace(/<[^>]*>?/gm, ''), // Sanitize description
        imageUrl: playlistInfo.images?.length ? playlistInfo.images[0].url : null,
        owner: playlistInfo.owner.display_name,
        spotifyUrl: playlistInfo.external_urls.spotify,
        tracks: processedTracks,
        stats: {
            totalTracks: processedTracks.length,
            totalDurationFormatted: `${totalMinutes}m ${totalSeconds}s`,
            uniqueArtists: uniqueArtistNames.size
            // Unique genres calculated dynamically later
        },
        artistDetails: artistDetails // Keep raw details if needed elsewhere
    };
}

// --- UI Display ---

function showLoading(show, message = "Loading...") {
    if (show) {
        loadingMessage.textContent = message;
        loadingOverlay.classList.remove('hidden');
        console.log("Loading:", message);
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showError(message, isWarning = false) {
    apiErrorDiv.textContent = message;
    apiErrorDiv.className = isWarning ? 'error-message warning' : 'error-message error'; // Add class for styling?
    apiErrorDiv.classList.remove('hidden');
    // Don't auto-hide critical errors, maybe warnings
    // setTimeout(() => { apiErrorDiv.classList.add('hidden'); }, 7000);
}

function clearError() {
     apiErrorDiv.classList.add('hidden');
     apiErrorDiv.textContent = '';
}

function displayPlaylistInfo(playlistData) {
    // Use template literals for cleaner HTML generation
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.imageUrl || 'placeholder.png'}" alt="${playlistData.name} cover art" loading="lazy">
        <div class="playlist-details">
            <h3>${playlistData.name}</h3>
            <p>By ${playlistData.owner}</p>
            ${playlistData.description ? `<p class="description">${playlistData.description}</p>` : ''}
            <p><a href="${playlistData.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="button-primary small">View on Spotify</a></p>
        </div>
    `;
    // Display stats that don't depend on genre source
    totalTracksEl.textContent = playlistData.stats.totalTracks;
    totalDurationEl.textContent = playlistData.stats.totalDurationFormatted;
    uniqueArtistsEl.textContent = playlistData.stats.uniqueArtists;
}

function getGenreCounts(tracks, source = 'spotify') {
    const genreCounts = {};
    const key = source === 'lastfm' ? 'lastFmTags' : 'spotifyGenres';

    tracks.forEach(track => {
        track[key]?.forEach(genre => {
            if (genre) { // Ensure genre is not null/empty/undefined
                 genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            }
        });
    });
    // Convert to array and sort
    const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);

    // Update the unique genres stat card
    uniqueGenresEl.textContent = sortedGenres.length;

    return sortedGenres;
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- Chart Rendering ---
function createOrUpdateChart(chartId, chartType, data, options, instanceKey) {
    const ctx = document.getElementById(chartId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas element with ID '${chartId}' not found.`);
        return;
    }

    if (chartInstances[instanceKey]) {
        chartInstances[instanceKey].destroy(); // Destroy previous instance cleanly
    }

    try {
        chartInstances[instanceKey] = new Chart(ctx, {
            type: chartType,
            data: data,
            options: options
        });
    } catch(e) {
        console.error(`Error creating chart '${instanceKey}':`, e);
        showError(`Could not render the ${instanceKey} chart.`);
    }
}

// Debounced chart update function
const debouncedUpdateCharts = debounce((genreData) => {
    if (!genreData || genreData.length === 0) {
         console.warn("No genre data to update charts.");
         // Optionally clear or hide charts here
         if (chartInstances.pie) chartInstances.pie.destroy();
         if (chartInstances.bar) chartInstances.bar.destroy();
         pieChartTitle.textContent = "Genre Distribution (No Data)";
         barChartTitle.textContent = "Top Genres (No Data)";
         return;
    }

    const topN = 15; // Show top N genres in charts
    const topGenres = genreData.slice(0, topN);
    const labels = topGenres.map(g => g.genre);
    const counts = topGenres.map(g => g.count);
    const backgroundColors = generateConsistentColors(labels); // Use helper for colors
    const sourceName = activeGenreSource === 'lastfm' ? 'Last.fm Tags' : 'Spotify Genres';

    // --- Pie Chart ---
    const pieData = {
        labels: labels,
        datasets: [{ data: counts, backgroundColor: backgroundColors, borderColor: '#ffffff', borderWidth: 1 }]
    };
    const pieOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels:{ boxWidth: 12, padding: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw}` } } },
        onClick: (e, elements) => handleChartClick(e, elements, labels)
    };
    createOrUpdateChart('genre-pie-chart', 'pie', pieData, pieOptions, 'pie');
    pieChartTitle.textContent = `Genre Distribution (${sourceName})`;

    // --- Bar Chart ---
    const barData = {
        labels: labels,
        datasets: [{ label: 'Track Count', data: counts, backgroundColor: backgroundColors, borderWidth: 0 }]
    };
    const barOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.raw} tracks` } } },
        scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } },
        onClick: (e, elements) => handleChartClick(e, elements, labels)
    };
    createOrUpdateChart('genre-bar-chart', 'bar', barData, barOptions, 'bar');
    barChartTitle.textContent = `Top Genres (${sourceName})`;

    // --- Update Genre Radio Buttons ---
    populateGenreRadioButtons(genreData.slice(0, 12)); // Use top 12 for radio

}, 250); // Debounce chart updates by 250ms

function handleChartClick(event, elements, labels) {
     if (elements.length > 0) {
        try {
             const chartElement = elements[0];
             const genre = labels[chartElement.index];
             if (genre) {
                 filterTracksByGenre(genre);
             }
        } catch (e) {
            console.error("Error handling chart click:", e);
        }
     }
}

function createReleaseYearChart(tracks) {
     if (!tracks || tracks.length === 0) return;

     const yearCounts = {};
     let minYear = Infinity, maxYear = -Infinity;
     tracks.forEach(track => {
         if (track.releaseYear && track.releaseYear > 1900) { // Filter out invalid years
             yearCounts[track.releaseYear] = (yearCounts[track.releaseYear] || 0) + 1;
             minYear = Math.min(minYear, track.releaseYear);
             maxYear = Math.max(maxYear, track.releaseYear);
         }
     });

     if (Object.keys(yearCounts).length === 0) return; // No valid years found

     // Create data points for all years in the range for a continuous line
     const labels = [];
     const data = [];
     for (let year = minYear; year <= maxYear; year++) {
         labels.push(year.toString());
         data.push(yearCounts[year] || 0);
     }

     const chartData = {
         labels: labels,
         datasets: [{
             label: 'Tracks Released', data: data,
             borderColor: 'rgba(29, 185, 84, 0.8)',
             backgroundColor: 'rgba(29, 185, 84, 0.2)',
             fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5
         }]
     };
     const chartOptions = {
         responsive: true, maintainAspectRatio: false,
         scales: {
             x: { title: { display: true, text: 'Year' }, grid: { display: false } },
             y: { beginAtZero: true, title: { display: true, text: 'Number of Tracks' }, grid: { color: '#eee' } }
         },
         plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }
     };
     createOrUpdateChart('release-year-chart', 'line', chartData, chartOptions, 'year');
}

function displayTopArtists(tracks, artistDetails) {
    if (!tracks || tracks.length === 0 || !artistDetails) return;

    const artistCounts = {};
    tracks.forEach(track => {
        // Count based on the primary artist name for simplicity in ranking
        if (track.primaryArtistName) {
            artistCounts[track.primaryArtistName] = (artistCounts[track.primaryArtistName] || 0) + 1;
        }
    });

    const sortedArtists = Object.entries(artistCounts)
        .map(([name, count]) => {
             // Find the full details for this artist (case-insensitive search might be needed if names vary)
             const details = Object.values(artistDetails).find(d => d.name === name);
             return {
                 name,
                 count,
                 imageUrl: details?.imageUrl,
                 spotifyUrl: details?.spotifyUrl
             };
        })
        .sort((a, b) => b.count - a.count);

    const topN = 10;
    const topArtists = sortedArtists.slice(0, topN);

    // --- Update Top Artists Chart (Doughnut) ---
    const chartLabels = topArtists.map(a => a.name);
    const chartData = topArtists.map(a => a.count);
    const chartColors = generateConsistentColors(chartLabels);

    const doughnutData = {
        labels: chartLabels,
        datasets: [{ label: 'Appearances', data: chartData, backgroundColor: chartColors, borderColor: '#ffffff', borderWidth: 2 }]
    };
    const doughnutOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw} tracks` } } }
    };
    createOrUpdateChart('top-artists-chart', 'doughnut', doughnutData, doughnutOptions, 'artists');


    // --- Update Top Artists List ---
    topArtistsListContainer.innerHTML = ''; // Clear previous
    if (topArtists.length === 0) {
         topArtistsListContainer.innerHTML = '<p>No artist data available.</p>';
         return;
    }
    topArtists.forEach(artist => {
        const card = document.createElement('div');
        card.className = 'artist-card';
        card.innerHTML = `
            <img src="${artist.imageUrl || 'placeholder.png'}" alt="${artist.name}" loading="lazy" class="${artist.imageUrl ? '' : 'artist-placeholder'}">
            <div class="artist-info">
                <h4>${artist.spotifyUrl ? `<a href="${artist.spotifyUrl}" target="_blank" rel="noopener noreferrer">${artist.name}</a>` : artist.name}</h4>
                <p>${artist.count} track${artist.count !== 1 ? 's' : ''}</p>
            </div>
        `;
        topArtistsListContainer.appendChild(card);
    });

    // --- Populate Similar Artists Buttons ---
     populateSimilarArtistButtons(topArtists);
}

// --- Track List Rendering ---
function displayTrackList(tracks, filterGenre = null, genreSourceToShow = 'spotify') {
    trackGenresListDiv.innerHTML = ''; // Clear previous list
    filterNoticeContainer.innerHTML = ''; // Clear previous filter notice

    // --- Filter Notice ---
    if (filterGenre) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'filter-notice';
        noticeDiv.innerHTML = `
            <span>Showing tracks filtered by: <strong>${filterGenre}</strong></span>
            <button id="clear-filter-btn" class="clear-filter-button">Clear Filter</button>
        `;
        filterNoticeContainer.appendChild(noticeDiv);
        document.getElementById('clear-filter-btn').addEventListener('click', () => {
            filterTracksByGenre(null); // Clear filter
        });
    }

    // --- Filter Tracks ---
    const filteredTracks = filterGenre
        ? tracks.filter(track => {
            const genresToCheck = new Set([
                ...(track.spotifyGenres || []),
                ...(track.lastFmTags || []) // Check both sources when filtering
            ]);
             return genresToCheck.has(filterGenre);
          })
        : tracks;

    if (filteredTracks.length === 0) {
        trackGenresListDiv.innerHTML = `<p>No tracks found${filterGenre ? ` matching the filter "${filterGenre}"` : ''}.</p>`;
        return;
    }

    // --- Render Tracks ---
    const fragment = document.createDocumentFragment();
    filteredTracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card';

        let genresHtml = '';
        const genresToShow = new Set(); // Use a Set to avoid duplicates when showing 'both'

        if (genreSourceToShow === 'spotify' || genreSourceToShow === 'both') {
            track.spotifyGenres?.forEach(g => genresToShow.add({ genre: g, source: 'spotify' }));
        }
        if (genreSourceToShow === 'lastfm' || genreSourceToShow === 'both') {
             track.lastFmTags?.forEach(g => genresToShow.add({ genre: g, source: 'lastfm' }));
        }

        // Sort genres alphabetically after collecting
         const sortedGenres = [...genresToShow].sort((a, b) => a.genre.localeCompare(b.genre));

        sortedGenres.forEach(item => {
            genresHtml += `<span class="track-genre genre-${item.source}" data-genre="${item.genre}" title="Filter by ${item.genre}">${item.genre}</span>`;
        });

        trackCard.innerHTML = `
            <img src="${track.imageUrl || 'placeholder.png'}" alt="${track.album}" loading="lazy">
            <div class="track-info">
                <div class="track-title" title="${track.title}${track.explicit ? ' (Explicit)' : ''}">${track.title}${track.explicit ? ' <span class="explicit-tag">E</span>' : ''}</div>
                <div class="track-artist">${track.artist}</div>
                <div class="track-album">${track.album} (${track.releaseYear || 'N/A'})</div>
                 ${track.spotifyUrl ? `<a href="${track.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="spotify-link" title="Listen on Spotify">▶️ Listen</a>` : ''}
                <div class="track-genres">${genresHtml || '<span class="no-genres">No tags available</span>'}</div>
            </div>
        `;

        // Add click listener to genre tags within the card
        trackCard.querySelectorAll('.track-genre').forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                filterTracksByGenre(tag.dataset.genre);
            });
        });
        fragment.appendChild(trackCard);
    });
    trackGenresListDiv.appendChild(fragment);
}

function filterTracksByGenre(genre) {
    currentGenreFilter = genre; // Update global filter state
    // Re-render the track list with the filter applied
    if (currentPlaylistData) {
        displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
        // Scroll to the track list section smoothly
        document.getElementById('track-genres-container')?.scrollIntoView({ behavior: 'smooth' });
    }
}


// --- Source Toggling Logic ---
function updateActiveGenreSource(newSource) {
     if (!currentPlaylistData || activeGenreSource === newSource) return;
     activeGenreSource = newSource;

     // Update button styles
     genreSourceButtons.forEach(btn => {
         btn.classList.toggle('active', btn.dataset.source === newSource);
     });

     // Regenerate charts and radio buttons based on the new source
    const genreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource);
    debouncedUpdateCharts(genreCounts); // Use debounced update

     console.log(`Genre source switched to: ${newSource}`);
}

function updateActiveTrackGenreSource(newSource) {
    if (!currentPlaylistData || activeTrackGenreSource === newSource) return;
    activeTrackGenreSource = newSource;
    // Re-render track list with new source setting (filter remains if active)
    displayTrackList(currentPlaylistData.tracks, currentGenreFilter, activeTrackGenreSource);
    console.log(`Track genre display switched to: ${newSource}`);
}


// --- Last.fm Feature Implementations ---

function populateGenreRadioButtons(topGenres) {
    genreRadioButtonsContainer.innerHTML = ''; // Clear previous
    genreRadioResultsPanel.classList.add('hidden'); // Hide results initially
    genreRadioListDiv.innerHTML = '';

    if (!topGenres || topGenres.length === 0) {
         genreRadioButtonsContainer.innerHTML = '<p class="small-text">No top genres identified from the selected source.</p>';
         return;
    }

    topGenres.forEach(({ genre }) => {
        const button = document.createElement('button');
        button.className = 'action-button genre-radio-btn';
        button.textContent = genre;
        button.dataset.genre = genre;
        button.addEventListener('click', () => fetchAndDisplayTopTracksForGenre(genre));
        genreRadioButtonsContainer.appendChild(button);
    });
}

async function fetchAndDisplayTopTracksForGenre(genre) {
    showLoading(true, `Fetching top tracks for '${genre}' from Last.fm...`);
    genreRadioListDiv.innerHTML = '<p class="small-text">Loading tracks...</p>'; // Placeholder
    selectedGenreRadioSpan.textContent = genre;
    genreRadioResultsPanel.classList.remove('hidden'); // Show panel

    const params = { method: 'tag.gettoptracks', tag: genre, limit: 12 };
    const data = await fetchLastFmAPI(params);
    showLoading(false);

    if (data?.tracks?.track?.length > 0) {
        genreRadioListDiv.innerHTML = ''; // Clear placeholder
        data.tracks.track.forEach(track => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item';
            const spotifySearchUrl = `https://open.spotify.com/search/${encodeURIComponent(track.name)}%20artist%3A${encodeURIComponent(track.artist.name)}`;
            itemDiv.innerHTML = `
                <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search on Spotify">${track.name}</a>
                <span>by ${track.artist.name}</span>
                ${track.listeners ? `<span>(${parseInt(track.listeners).toLocaleString()} listeners)</span>` : ''}
            `;
            genreRadioListDiv.appendChild(itemDiv);
        });
    } else {
        genreRadioListDiv.innerHTML = `<p class="small-text">Could not find popular tracks for "${genre}" on Last.fm.</p>`;
    }
    // Scroll to results smoothly
     genreRadioResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function populateSimilarArtistButtons(topArtists) {
    similarArtistsButtonsContainer.innerHTML = ''; // Clear previous
    similarArtistsResultsPanel.classList.add('hidden'); // Hide results
    similarArtistsListDiv.innerHTML = '';

    if (!topArtists || topArtists.length === 0) {
         similarArtistsButtonsContainer.innerHTML = '<p class="small-text">No top artists identified yet.</p>';
         return;
    }

    topArtists.slice(0, 10).forEach(({ name }) => { // Show buttons for top 10 artists
        const button = document.createElement('button');
        button.className = 'action-button similar-artist-btn';
        button.textContent = name;
        button.dataset.artist = name;
        button.addEventListener('click', () => fetchAndDisplaySimilarArtists(name));
        similarArtistsButtonsContainer.appendChild(button);
    });
}

async function fetchAndDisplaySimilarArtists(artistName) {
    showLoading(true, `Fetching artists similar to '${artistName}' from Last.fm...`);
    similarArtistsListDiv.innerHTML = '<p class="small-text">Loading similar artists...</p>';
    selectedArtistSpan.textContent = artistName;
    similarArtistsResultsPanel.classList.remove('hidden');

    const params = { method: 'artist.getsimilar', artist: artistName, autocorrect: 1, limit: 12 };
    const data = await fetchLastFmAPI(params);
    showLoading(false);

    if (data?.similarartists?.artist?.length > 0) {
         similarArtistsListDiv.innerHTML = ''; // Clear placeholder
        data.similarartists.artist.forEach(artist => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'lastfm-result-item';
            const spotifySearchUrl = `https://open.spotify.com/search/artist%3A${encodeURIComponent(artist.name)}`;
            itemDiv.innerHTML = `
                 <a href="${spotifySearchUrl}" target="_blank" rel="noopener noreferrer" title="Search '${artist.name}' on Spotify">${artist.name}</a>
                <span>(Match: ${Math.round(artist.match * 100)}%)</span>
            `;
            similarArtistsListDiv.appendChild(itemDiv);
        });
    } else {
        similarArtistsListDiv.innerHTML = `<p class="small-text">Could not find similar artists for "${artistName}" on Last.fm.</p>`;
    }
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
        showError("Invalid Spotify Playlist URL or ID format.");
        return;
    }

    showLoading(true, "Starting analysis...");
    resultsContainer.classList.add('hidden'); // Hide previous results
    clearError(); // Clear old errors
    currentPlaylistData = null;
    currentGenreFilter = null;
    // Reset potentially active result panels
    genreRadioResultsPanel.classList.add('hidden');
    similarArtistsResultsPanel.classList.add('hidden');


    try {
        // 1. Fetch Playlist Info
        showLoading(true, "Fetching playlist details...");
        const playlistInfo = await fetchSpotifyAPI(`playlists/${playlistId}?fields=id,name,description,images,owner(display_name),external_urls,tracks(total)`);
        if (!playlistInfo) throw new Error("Could not fetch playlist details from Spotify.");
        if (playlistInfo.tracks?.total === 0) throw new Error("This playlist appears to be empty.");

        // 2. Fetch Tracks
        const tracksRaw = await getPlaylistTracks(playlistId);
        if (!tracksRaw || tracksRaw.length === 0) throw new Error("Playlist tracks could not be fetched or are empty.");

        // 3. Get Unique Artist IDs
        const artistIds = [...new Set(tracksRaw.flatMap(item => item?.track?.artists?.map(a => a.id)).filter(Boolean))];
         if (artistIds.length === 0) throw new Error("No valid artists found in the playlist tracks.");

        // 4. Fetch Artist Details (Spotify Genres + Last.fm Tags)
        const artistDetails = await getArtistDetailsAndGenres(artistIds);
         if (!artistDetails || Object.keys(artistDetails).length === 0) throw new Error("Failed to fetch artist details.");

        // 5. Process Data
        showLoading(true, "Processing data...");
        currentPlaylistData = processPlaylistData(playlistInfo, tracksRaw, artistDetails);

        // 6. Display Results
        showLoading(true, "Rendering results...");

         // Make container visible BEFORE creating charts/content
         resultsContainer.classList.remove('hidden');

        displayPlaylistInfo(currentPlaylistData); // Includes basic stats

        // -- Initial Display using default active sources --
        const initialGenreCounts = getGenreCounts(currentPlaylistData.tracks, activeGenreSource); // Also updates genre stat card
        debouncedUpdateCharts(initialGenreCounts); // Renders pie/bar, populates radio buttons
        createReleaseYearChart(currentPlaylistData.tracks);
        displayTopArtists(currentPlaylistData.tracks, currentPlaylistData.artistDetails); // Renders chart/list, populates similar artist buttons
        displayTrackList(currentPlaylistData.tracks, null, activeTrackGenreSource); // Initial track list

        showLoading(false); // Hide loading AFTER rendering starts
        console.log("Analysis complete and results displayed.");
         // Scroll to results
         resultsContainer.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("Analysis pipeline failed:", error);
        showError(`Analysis failed: ${error.message}`);
        resultsContainer.classList.add('hidden'); // Ensure results are hidden on error
        showLoading(false); // Hide loading overlay on error
    }
}

// --- Utility Functions ---

// Simple hash function for string to get a number (more distributed than basic)
function simpleHash(str) {
  let hash = 5381; // djb2 hash start
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
    hash |= 0; // Ensure 32bit integer
  }
  return Math.abs(hash);
}

// Generate consistent colors based on labels using HSL for better distribution
function generateConsistentColors(labels) {
    const colors = [];
    const saturation = 70; // Keep saturation consistent
    const lightness = 55; // Keep lightness consistent

    labels.forEach((label) => {
        const hue = simpleHash(label) % 360; // Use hash for consistency
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    });
    return colors;
}


// --- Event Listeners ---
function setupEventListeners() {
    loginButton.addEventListener('click', redirectToSpotifyLogin);
    analyzeButton.addEventListener('click', analyzePlaylist);

    // Genre Source Toggle Buttons
    genreSourceButtons.forEach(button => {
        button.addEventListener('click', () => {
            updateActiveGenreSource(button.dataset.source);
        });
    });

    // Track Genre Source Radio Buttons
    trackGenreSourceRadios.forEach(radio => {
        radio.addEventListener('change', () => { // Use change event for radios
            if (radio.checked) {
                updateActiveTrackGenreSource(radio.value);
            }
        });
    });

     // Allow pressing Enter in the input field to trigger analysis
     playlistInput.addEventListener('keypress', (event) => {
         if (event.key === 'Enter') {
             event.preventDefault(); // Prevent default form submission if it were in a form
             analyzeButton.click(); // Trigger the button click
         }
     });
}

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing application.");
    handleAuthentication(); // Check login status first
    setupEventListeners();
    // Set initial state for toggles based on default variables
    document.querySelector(`.toggle-button[data-source="${activeGenreSource}"]`)?.classList.add('active');
    document.getElementById(`genre-toggle-${activeTrackGenreSource}`)?.setAttribute('checked', true);
});