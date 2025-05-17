import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'];

function createOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL.replace('/auth/google/callback', '/coach/calendar/callback'));
}

function getAuthUrl() {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

async function getToken(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function setCredentials(tokens) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function listUpcomingEvents(tokens, maxResults = 10) {
  const auth = setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

export default {
  getAuthUrl,
  getToken,
  listUpcomingEvents,
}; 