// Your Spotify API credentials
const clientId = '732dc1eab09c4120945541da8f197de8';
// Hardcoded redirect URI - must match EXACTLY what's in Spotify Dashboard
const redirectUri = 'https://kleinschock.github.io/SpotifyPlaylistInsight/';

// Required Spotify API scopes
const scopes = 'playlist-read-private playlist-read-collaborative';

// DOM elements
const loginButton = document.getElementById('login-button');
const debugDiv = document.createElement('div');
debugDiv.style.background = '#f8f8f8';
debugDiv.style.padding = '15px';
debugDiv.style.margin = '20px 0';
debugDiv.style.border = '1px solid #ddd';
document.querySelector('.container').appendChild(debugDiv);

// Debug info
debugDiv.innerHTML = `
    <h3>Debug Information</h3>
    <p><strong>Client ID:</strong> ${clientId}</p>
    <p><strong>Redirect URI:</strong> ${redirectUri}</p>
    <p><strong>Current URL:</strong> ${window.location.href}</p>
    <button id="debug-button">Test Authorization URL</button>
    <div id="auth-url-display" style="margin-top: 10px; word-break: break-all;"></div>
`;

// Event listeners
document.getElementById('debug-button').addEventListener('click', function() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    document.getElementById('auth-url-display').innerHTML = `<p><strong>Auth URL:</strong> <a href="${authUrl}" target="_blank">${authUrl}</a></p>`;
});

loginButton.addEventListener('click', handleLogin);

// Handle login with Spotify
function handleLogin() {
    // Log the auth URL
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    console.log('Auth URL:', authUrl);
    
    // Navigate to Spotify auth
    window.location.href = authUrl;
}

// Check if we're coming back from Spotify auth
window.onload = function() {
    document.getElementById('loading-overlay').classList.add('hidden');
    
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    const error = params.get('error');
    
    if (error) {
        debugDiv.innerHTML += `<p style="color: red;"><strong>Error:</strong> ${error}</p>`;
    }
    
    if (accessToken) {
        // Store the token and show the playlist input
        localStorage.setItem('spotify_access_token', accessToken);
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('playlist-container').classList.remove('hidden');
        debugDiv.innerHTML += `<p style="color: green;"><strong>Success:</strong> Access token received!</p>`;
        
        // Clear the hash to avoid issues if the page is refreshed
        window.history.replaceState(null, null, ' ');
    } else if (localStorage.getItem('spotify_access_token')) {
        // We already have a token
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('playlist-container').classList.remove('hidden');
        debugDiv.innerHTML += `<p style="color: blue;"><strong>Info:</strong> Using existing access token</p>`;
    }
};