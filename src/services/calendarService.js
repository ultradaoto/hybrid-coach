import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'];

function createOAuthClient(callbackPath = '/coach/calendar/callback') {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;
  const baseUrl = GOOGLE_CALLBACK_URL.replace('/auth/google/callback', '');
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, baseUrl + callbackPath);
}

function getAuthUrl(callbackPath = '/coach/calendar/callback') {
  const oauth2Client = createOAuthClient(callbackPath);
  return oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

async function getToken(code, callbackPath = '/coach/calendar/callback') {
  const oauth2Client = createOAuthClient(callbackPath);
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

async function createEvent(tokens, eventData) {
  const auth = setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth });
  
  const event = {
    summary: eventData.summary,
    description: eventData.description,
    start: {
      dateTime: eventData.startTime,
      timeZone: eventData.timeZone || 'America/New_York',
    },
    end: {
      dateTime: eventData.endTime,
      timeZone: eventData.timeZone || 'America/New_York',
    },
    attendees: eventData.attendees || [],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 15 }, // 15 minutes before
      ],
    },
  };

  if (eventData.meetingLink) {
    event.location = eventData.meetingLink;
    event.description = (event.description || '') + `\n\nJoin the meeting: ${eventData.meetingLink}`;
  }

  const res = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return res.data;
}

export default {
  getAuthUrl,
  getToken,
  listUpcomingEvents,
  createEvent,
}; 