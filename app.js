// Ensure loading overlay is hidden on page load
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loading-overlay').classList.add('hidden');
});

// Your Spotify API credentials
const clientId = '732dc1eab09c4120945541da8f197de8';
const redirectUri = 'https://kleinschock.github.io/SpotifyPlaylistInsight/';

// Required Spotify API scopes
const scopes = 'playlist-read-private playlist-read-collaborative';

// DOM elements
const loginButton = document.getElementById('login-button');
const playlistContainer = document.getElementById('playlist-container');
const playlistInput = document.getElementById('playlist-input');
const analyzeButton = document.getElementById('analyze-button');
const resultsContainer = document.getElementById('results-container');
const playlistInfoDiv = document.getElementById('playlist-info');
const trackGenresList = document.getElementById('track-genres-list');

// Event listeners
loginButton.addEventListener('click', handleLogin);
analyzeButton.addEventListener('click', analyzePlaylist);

// Check if we're coming back from Spotify auth
window.onload = function() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    
    if (accessToken) {
        // Store the token and show the playlist input
        localStorage.setItem('spotify_access_token', accessToken);
        document.getElementById('login-container').classList.add('hidden');
        playlistContainer.classList.remove('hidden');
        
        // Clear the hash to avoid issues if the page is refreshed
        window.history.replaceState(null, null, ' ');
    } else if (localStorage.getItem('spotify_access_token')) {
        // We already have a token
        document.getElementById('login-container').classList.add('hidden');
        playlistContainer.classList.remove('hidden');
    }
};

// Handle login with Spotify
function handleLogin() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    window.location.href = authUrl;
}

// Analyze the playlist
async function analyzePlaylist() {
    const playlistUrl = playlistInput.value.trim();
    if (!playlistUrl) {
        alert('Please enter a Spotify playlist URL or ID');
        return;
    }
    
    // Extract playlist ID from URL or use the input as ID
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
        alert('Invalid playlist URL or ID');
        return;
    }
    
    try {
        showLoading();
        
        // Get the playlist data
        const playlistData = await getPlaylist(playlistId);
        const tracks = playlistData.tracks.items.map(item => item.track).filter(track => track); // Filter out null tracks
        
        // Get genres for each artist
        const artistIds = [...new Set(tracks.flatMap(track => track.artists.map(artist => artist.id)))];
        const artistGenres = await getArtistGenres(artistIds);
        
        // Assign genres to tracks
        const tracksWithGenres = assignGenresToTracks(tracks, artistGenres);
        
        // Generate genre statistics
        const genreStats = generateGenreStats(tracksWithGenres);
        
        // Display the results
        displayResults(playlistData, tracksWithGenres, genreStats);
    } catch (error) {
        console.error('Error analyzing playlist:', error);
        alert('Error analyzing playlist. Please check the URL and try again.');
    } finally {
        hideLoading();
    }
}

// Show loading indicator
function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

// Extract playlist ID from URL or use as is
function extractPlaylistId(input) {
    // Check if it's a full URL
    if (input.includes('spotify.com/playlist/')) {
        const match = input.match(/playlist\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
    // Check if it's just the ID
    if (/^[a-zA-Z0-9]{22}$/.test(input)) {
        return input;
    }
    return null;
}

// Fetch playlist data from Spotify API (including all tracks)
async function getPlaylist(playlistId) {
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
        throw new Error('No access token found. Please login again.');
    }
    
    // Get playlist details
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            // Token expired, clear it and redirect to login
            localStorage.removeItem('spotify_access_token');
            alert('Session expired. Please login again.');
            window.location.href = window.location.pathname;
            throw new Error('Session expired');
        }
        throw new Error(`Failed to get playlist: ${response.statusText}`);
    }
    
    const playlistData = await response.json();
    
    // If there are more tracks than returned in the first request
    if (playlistData.tracks.total > playlistData.tracks.items.length) {
        // Fetch all remaining tracks
        const allTracks = [...playlistData.tracks.items];
        let nextUrl = playlistData.tracks.next;
        
        while (nextUrl) {
            const tracksResponse = await fetch(nextUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!tracksResponse.ok) {
                throw new Error(`Failed to get tracks: ${tracksResponse.statusText}`);
            }
            
            const tracksData = await tracksResponse.json();
            allTracks.push(...tracksData.items);
            nextUrl = tracksData.next;
        }
        
        // Replace the tracks in the playlist data
        playlistData.tracks.items = allTracks;
    }
    
    return playlistData;
}

// Get genres for artists
async function getArtistGenres(artistIds) {
    const accessToken = localStorage.getItem('spotify_access_token');
    const result = {};
    
    // Spotify API allows a maximum of 50 IDs per request
    for (let i = 0; i < artistIds.length; i += 50) {
        const batch = artistIds.slice(i, i + 50);
        const response = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(',')}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get artist data: ${response.statusText}`);
        }
        
        const data = await response.json();
        data.artists.forEach(artist => {
            result[artist.id] = artist.genres;
        });
    }
    
    return result;
}

// Assign genres to tracks based on artist genres
function assignGenresToTracks(tracks, artistGenres) {
    return tracks.map(track => {
        // Collect all genres from all artists of the track
        const genres = [...new Set(track.artists.flatMap(artist => 
            artistGenres[artist.id] || []))];
        
        return {
            ...track,
            genres: genres.length ? genres : ['Unknown']
        };
    });
}

// Generate statistics about genres
function generateGenreStats(tracksWithGenres) {
    const genreCounts = {};
    
    tracksWithGenres.forEach(track => {
        track.genres.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
    });
    
    // Sort genres by count (descending)
    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([genre, count]) => ({
            genre,
            count,
            percentage: (count / tracksWithGenres.length * 100).toFixed(1)
        }));
    
    return {
        allGenres: sortedGenres,
        topGenres: sortedGenres.slice(0, 10) // Top 10 genres
    };
}

// Display the results
function displayResults(playlistData, tracksWithGenres, genreStats) {
    // Show the results container
    resultsContainer.classList.remove('hidden');
    
    // Display playlist info
    playlistInfoDiv.innerHTML = `
        <img src="${playlistData.images[0]?.url || 'placeholder.png'}" alt="${playlistData.name}">
        <h2>${playlistData.name}</h2>
        <p>by ${playlistData.owner.display_name}</p>
        <p>${tracksWithGenres.length} tracks</p>
    `;
    
    // Create pie chart for top genres
    createGenrePieChart(genreStats.topGenres);
    
    // Create bar chart for top genres
    createGenreBarChart(genreStats.topGenres);
    
    // Display track list with genres
    displayTrackGenres(tracksWithGenres);
    
    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
}

// Create a pie chart for genres
function createGenrePieChart(topGenres) {
    const ctx = document.getElementById('genre-pie-chart').getContext('2d');
    
    // Generate colors for each genre
    const colors = generateColors(topGenres.length);
    
    // Prepare data for Chart.js
    const data = {
        labels: topGenres.map(g => g.genre),
        datasets: [{
            data: topGenres.map(g => g.count),
            backgroundColor: colors,
            borderColor: 'white',
            borderWidth: 1
        }]
    };
    
    // Destroy previous chart if it exists
    if (window.genreChart) {
        window.genreChart.destroy();
    }
    
    // Create new chart
    window.genreChart = new Chart(ctx, {
        type: 'pie',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 20,
                        boxWidth: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const genre = topGenres[context.dataIndex];
                            return `${genre.genre}: ${genre.count} tracks (${genre.percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Create a bar chart for genres
function createGenreBarChart(topGenres) {
    const ctx = document.getElementById('genre-bar-chart').getContext('2d');
    
    // Generate colors for each genre
    const colors = generateColors(topGenres.length);
    
    // Prepare data for Chart.js
    const data = {
        labels: topGenres.map(g => g.genre),
        datasets: [{
            label: 'Number of Tracks',
            data: topGenres.map(g => g.count),
            backgroundColor: colors,
            borderColor: colors,
            borderWidth: 1
        }]
    };
    
    // Destroy previous chart if it exists
    if (window.genreBarChart) {
        window.genreBarChart.destroy();
    }
    
    // Create new chart
    window.genreBarChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',  // horizontal bar chart
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const genre = topGenres[context.dataIndex];
                            return `${genre.count} tracks (${genre.percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Tracks'
                    }
                }
            }
        }
    });
}

// Generate colors for chart
function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * (360 / count)) % 360;
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
}

// Display track list with genres
function displayTrackGenres(tracks) {
    trackGenresList.innerHTML = '';
    
    tracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card';
        
        trackCard.innerHTML = `
            <img src="${track.album.images[2]?.url || 'placeholder.png'}" alt="${track.name}">
            <div class="track-title">${track.name}</div>
            <div class="track-artist">${track.artists.map(a => a.name).join(', ')}</div>
            <div class="track-genres">
                ${track.genres.map(genre => `
                    <span class="track-genre">${genre}</span>
                `).join(' ')}
            </div>
        `;
        
        trackGenresList.appendChild(trackCard);
    });
}