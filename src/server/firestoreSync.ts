import fs from 'fs';
import path from 'path';
import type { DbSchema } from './db.ts';

// Read config safely
let firebaseConfig: {
  projectId?: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
} = {};

try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.warn('Could not load firebase-applet-config.json:', err);
}

const PROJECT_ID = firebaseConfig.projectId || 'ai-studio-applet-webapp-cea53';
const API_KEY = firebaseConfig.apiKey || '';
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

/**
 * Pushes full application state to Firestore REST API for persistent cloud storage.
 */
export async function pushStateToFirestore(data: DbSchema): Promise<boolean> {
  if (!API_KEY || !PROJECT_ID) return false;
  try {
    const url = `${BASE_URL}/system/sendflow_state?key=${API_KEY}`;
    
    // Sanitize state for cloud storage (exclude passwords hashes)
    const exportableData = {
      chatwootConnections: data.chatwootConnections || [],
      openaiSettings: data.openaiSettings,
      templates: data.templates || [],
      contactLists: data.contactLists || [],
      contacts: data.contacts || [],
      campaigns: data.campaigns || [],
      campaignContacts: data.campaignContacts || [],
      campaignLogs: (data.campaignLogs || []).slice(0, 1000), // Keep latest 1000 logs in cloud snapshot
      savedAt: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(exportableData);

    const body = {
      fields: {
        updatedAt: { stringValue: new Date().toISOString() },
        payload: { stringValue: payloadString },
        version: { integerValue: '1' },
      },
    };

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`Firestore REST push failed (${res.status}):`, errText);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Failed to push state to Firestore:', err);
    return false;
  }
}

/**
 * Pulls application state from Firestore REST API.
 */
export async function pullStateFromFirestore(): Promise<Partial<DbSchema> | null> {
  if (!API_KEY || !PROJECT_ID) return null;
  try {
    const url = `${BASE_URL}/system/sendflow_state?key=${API_KEY}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      if (res.status === 404) {
        return null; // Document not created yet
      }
      console.warn(`Firestore REST pull error (${res.status})`);
      return null;
    }

    const doc = await res.json();
    const payloadStr = doc.fields?.payload?.stringValue;
    if (!payloadStr) return null;

    const parsed = JSON.parse(payloadStr);
    return parsed;
  } catch (err) {
    console.warn('Failed to pull state from Firestore:', err);
    return null;
  }
}
